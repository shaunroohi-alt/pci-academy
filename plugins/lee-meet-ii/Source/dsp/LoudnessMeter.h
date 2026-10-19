#pragma once
#include "Biquad.h"
#include <array>
#include <atomic>
#include <algorithm>
#include <cmath>

namespace lm2::dsp
{
/**
    ITU-R BS.1770-4 / EBU R128 loudness meter.

    Produces momentary (400 ms), short-term (3 s) and gated integrated loudness.
    Integrated loudness uses the two-stage gate (-70 LUFS absolute, -10 LU relative)
    over 400 ms blocks with 75 % overlap, implemented with a histogram so it runs in
    constant time on the audio thread with no allocation.

    Up to two channels (L/R, weight 1.0 each). Values are published through atomics
    so a UI thread can read them without locking.
*/
class LoudnessMeter
{
public:
    static constexpr float kSilence = -120.0f;

    void prepare (double sampleRate)
    {
        fs = sampleRate;
        for (auto& ch : stage1) ch = designPreFilter (sampleRate);
        for (auto& ch : stage2) ch = designRlbFilter (sampleRate);
        hopLength = std::max (1, (int) std::lround (sampleRate * 0.1));
        reset();
    }

    void reset()
    {
        for (auto& b : stage1) b.reset();
        for (auto& b : stage2) b.reset();
        hopAccum = 0.0;
        hopCount = 0;
        hopRing.fill (0.0);
        hopWrite = 0;
        hopsSeen = 0;
        histCount.fill (0);
        histPower.fill (0.0);
        momentaryLufs.store (kSilence);
        shortTermLufs.store (kSilence);
        integratedLufs.store (kSilence);
    }

    /** Feed numChannels (1 or 2) blocks of numSamples. */
    void process (const float* const* channels, int numChannels, int numSamples) noexcept
    {
        const int nch = std::min (numChannels, 2);
        for (int i = 0; i < numSamples; ++i)
        {
            double sum = 0.0;
            for (int c = 0; c < nch; ++c)
            {
                const double x = stage2[(size_t) c].process (stage1[(size_t) c].process ((double) channels[c][i]));
                sum += x * x;
            }
            hopAccum += sum;
            if (++hopCount >= hopLength)
                finishHop();
        }
    }

    float getMomentary()  const noexcept { return momentaryLufs.load (std::memory_order_relaxed); }
    float getShortTerm()  const noexcept { return shortTermLufs.load (std::memory_order_relaxed); }
    float getIntegrated() const noexcept { return integratedLufs.load (std::memory_order_relaxed); }

    static float powerToLufs (double meanSquare) noexcept
    {
        if (meanSquare <= 1.0e-12) return kSilence;
        return (float) (-0.691 + 10.0 * std::log10 (meanSquare));
    }

    static Biquad designPreFilter (double sampleRate) noexcept
    {
        // High-shelf "pre-filter" of the K-weighting curve (BS.1770-4), sample-rate agnostic design.
        const double f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
        const double K  = std::tan (M_PI * f0 / sampleRate);
        const double Vh = std::pow (10.0, G / 20.0);
        const double Vb = std::pow (Vh, 0.4996667741545416);
        const double a0 = 1.0 + K / Q + K * K;
        Biquad b;
        b.b0 = (Vh + Vb * K / Q + K * K) / a0;
        b.b1 = 2.0 * (K * K - Vh) / a0;
        b.b2 = (Vh - Vb * K / Q + K * K) / a0;
        b.a1 = 2.0 * (K * K - 1.0) / a0;
        b.a2 = (1.0 - K / Q + K * K) / a0;
        return b;
    }

    static Biquad designRlbFilter (double sampleRate) noexcept
    {
        // RLB high-pass stage of the K-weighting curve.
        const double f0 = 38.13547087602444, Q = 0.5003270373238773;
        const double K  = std::tan (M_PI * f0 / sampleRate);
        const double a0 = 1.0 + K / Q + K * K;
        Biquad b;
        b.b0 = 1.0; b.b1 = -2.0; b.b2 = 1.0;
        b.a1 = 2.0 * (K * K - 1.0) / a0;
        b.a2 = (1.0 - K / Q + K * K) / a0;
        return b;
    }

private:
    static constexpr int kShortTermHops = 30;   // 3 s / 100 ms
    static constexpr int kMomentaryHops = 4;    // 400 ms / 100 ms
    static constexpr int kHistBins = 1000;      // -70 .. +30 LUFS in 0.1 LU steps
    static constexpr double kHistMin = -70.0, kHistStep = 0.1;

    void finishHop() noexcept
    {
        const double hopPower = hopAccum / (double) hopLength;
        hopAccum = 0.0;
        hopCount = 0;

        hopRing[(size_t) hopWrite] = hopPower;
        hopWrite = (hopWrite + 1) % kShortTermHops;
        if (hopsSeen < kShortTermHops) ++hopsSeen;

        const double momentaryPower = averageOfLast (kMomentaryHops);
        const double shortTermPower = averageOfLast (kShortTermHops);

        if (hopsSeen >= kMomentaryHops)
        {
            const float m = powerToLufs (momentaryPower);
            momentaryLufs.store (m, std::memory_order_relaxed);

            // Integrated: absolute gate at -70 LUFS, store in histogram.
            if (m > -70.0f)
            {
                int bin = (int) std::floor ((m - kHistMin) / kHistStep);
                bin = std::clamp (bin, 0, kHistBins - 1);
                histCount[(size_t) bin] += 1;
                histPower[(size_t) bin] += momentaryPower;
                updateIntegrated();
            }
        }
        if (hopsSeen >= kShortTermHops)
            shortTermLufs.store (powerToLufs (shortTermPower), std::memory_order_relaxed);
    }

    double averageOfLast (int n) const noexcept
    {
        n = std::min (n, hopsSeen);
        if (n <= 0) return 0.0;
        double s = 0.0;
        int idx = hopWrite;
        for (int i = 0; i < n; ++i)
        {
            idx = (idx + kShortTermHops - 1) % kShortTermHops;
            s += hopRing[(size_t) idx];
        }
        return s / (double) n;
    }

    void updateIntegrated() noexcept
    {
        double total = 0.0; long long count = 0;
        for (int i = 0; i < kHistBins; ++i) { total += histPower[(size_t) i]; count += histCount[(size_t) i]; }
        if (count == 0) return;
        const double relThreshold = (double) powerToLufs (total / (double) count) - 10.0;
        int startBin = (int) std::floor ((relThreshold - kHistMin) / kHistStep);
        startBin = std::clamp (startBin, 0, kHistBins);
        double gated = 0.0; long long gatedCount = 0;
        for (int i = startBin; i < kHistBins; ++i) { gated += histPower[(size_t) i]; gatedCount += histCount[(size_t) i]; }
        if (gatedCount == 0) return;
        integratedLufs.store (powerToLufs (gated / (double) gatedCount), std::memory_order_relaxed);
    }

    double fs = 48000.0;
    std::array<Biquad, 2> stage1, stage2;
    int hopLength = 4800;
    double hopAccum = 0.0;
    int hopCount = 0;
    std::array<double, kShortTermHops> hopRing {};
    int hopWrite = 0, hopsSeen = 0;
    std::array<long long, kHistBins> histCount {};
    std::array<double, kHistBins> histPower {};
    std::atomic<float> momentaryLufs { kSilence }, shortTermLufs { kSilence }, integratedLufs { kSilence };
};
} // namespace lm2::dsp
