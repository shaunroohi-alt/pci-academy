#pragma once
#include <array>
#include <atomic>
#include <algorithm>
#include <cmath>
#include <vector>
#include "Biquad.h"
#include "IntDelay.h"

namespace lm2::dsp
{
/**
    Look-ahead true-peak brickwall limiter (stereo linked).

    Detection runs on an oversampled copy of the signal (polyphase Kaiser-windowed
    sinc interpolator, 32 taps per phase). The factor adapts to the sample rate so the
    detection rate is always >= ~350 kHz: 8x at 44.1/48 kHz, 4x at 88.2/96 kHz, 2x above.
    The gain computer at the oversampled rate is:

        required gain  ->  release one-pole  ->  sliding minimum (N+1)  ->  box average (N)

    which guarantees the gain has fully ramped down (linearly, over the look-ahead
    time) by the time a peak arrives, with no overshoot from the smoothing itself.
    The computed gain is then applied to the *un-oversampled* dry signal, delayed by
    the look-ahead, so the limiter is bit-transparent when the signal is under the
    ceiling: no resampling filter ever touches the audio path.
*/
class TruePeakLimiter
{
public:
    static constexpr int kMaxOversample = 8;
    static constexpr int kTapsPerPhase = 32;                      // taps per polyphase branch
    static constexpr int kInterpDelay = kTapsPerPhase / 2;        // 16 base samples of group delay

    void prepare (double sampleRate, double lookaheadMs = 2.0)
    {
        fs = sampleRate;
        oversample = sampleRate < 50000.0 ? 8 : (sampleRate < 100000.0 ? 4 : 2);
        fsOs = sampleRate * oversample;
        lookaheadSamples = std::max (1, (int) std::lround (lookaheadMs * 0.001 * sampleRate));
        delaySamples = lookaheadSamples + kInterpDelay;
        windowOs = oversample * lookaheadSamples;
        designInterpolator();

        for (auto& d : dryDelay) d.prepare (delaySamples);
        for (auto& h : history) h.fill (0.0f);
        minDeque.assign ((size_t) windowOs + 2, {});
        boxRing.assign ((size_t) windowOs, 1.0f);
        setRelease (releaseMs);
        reset();
    }

    void reset()
    {
        for (auto& d : dryDelay) d.reset();
        for (auto& h : history) h.fill (0.0f);
        histPos = 0;
        releaseState = 1.0f;
        dqHead = dqTail = 0;
        sampleIndex = 0;
        std::fill (boxRing.begin(), boxRing.end(), 1.0f);
        boxPos = 0;
        boxSum = (double) windowOs;
        boxRefresh = 0;
        minGainThisBlock.store (1.0f);
    }

    void setCeilingDb (float dB) noexcept { ceilingLin = std::pow (10.0f, dB / 20.0f); }

    void setRelease (float ms) noexcept
    {
        releaseMs = ms;
        const double t = std::max (1.0, (double) ms) * 0.001 * fsOs;
        releaseCoef = (float) (1.0 - std::exp (-1.0 / t));
    }

    void setEnabled (bool shouldBeEnabled) noexcept { enabled = shouldBeEnabled; }

    int getLatencySamples() const noexcept { return delaySamples; }

    /** Gain reduction (dB, <= 0) measured since the last call; resets the hold. */
    float getAndResetGainReductionDb() noexcept
    {
        const float g = minGainThisBlock.exchange (1.0f);
        return 20.0f * std::log10 (std::max (g, 1.0e-5f));
    }

    void process (float* left, float* right, int numSamples) noexcept
    {
        float blockMin = 1.0f;
        for (int i = 0; i < numSamples; ++i)
        {
            const float inL = left[i], inR = right[i];

            // --- dry delay (always applied so latency is constant even when disabled)
            const float dL = dryDelay[0].process (inL);
            const float dR = dryDelay[1].process (inR);

            // --- push into interpolator history
            history[0][(size_t) histPos] = inL;
            history[1][(size_t) histPos] = inR;

            // --- oversampled detection points for this base interval, gain computer per point
            float gApply = 1.0f;
            for (int p = 0; p < oversample; ++p)
            {
                float accL = 0.0f, accR = 0.0f;
                int idx = histPos;
                const float* ph = phase[(size_t) p].data();
                for (int k = 0; k < kTapsPerPhase; ++k)
                {
                    accL += ph[k] * history[0][(size_t) idx];
                    accR += ph[k] * history[1][(size_t) idx];
                    idx = (idx == 0) ? kTapsPerPhase - 1 : idx - 1;
                }
                const float peak = std::max (std::abs (accL), std::abs (accR));
                const float gReq = peak > ceilingLin ? ceilingLin / peak : 1.0f;

                // release one-pole toward unity, instantaneous downwards
                releaseState += (1.0f - releaseState) * releaseCoef;
                releaseState = std::min (releaseState, gReq);

                const float gMin = slidingMin (releaseState);
                const float gOut = boxAverage (gMin);
                gApply = std::min (gApply, gOut);
            }
            histPos = (histPos + 1) % kTapsPerPhase;

            if (enabled)
            {
                left[i]  = dL * gApply;
                right[i] = dR * gApply;
                blockMin = std::min (blockMin, gApply);
            }
            else
            {
                left[i] = dL;
                right[i] = dR;
            }
        }
        float prev = minGainThisBlock.load();
        while (blockMin < prev && ! minGainThisBlock.compare_exchange_weak (prev, blockMin)) {}
    }

private:
    struct DqEntry { float value = 1.0f; long long index = 0; };

    void designInterpolator()
    {
        // Kaiser-windowed sinc low-pass at fs/2 for 4x interpolation, centred on tap L/2 so the
        // group delay is exactly kInterpDelay base samples. beta = 8 keeps the pass-band flat to
        // ~20 kHz at 48 kHz, which a short 48-tap design does not.
        const int L = oversample * kTapsPerPhase;
        std::array<double, kMaxOversample * kTapsPerPhase> h {};
        const double centre = L / 2.0;
        const double beta = 8.0;
        const double i0beta = besselI0 (beta);
        for (int n = 0; n < L; ++n)
        {
            const double t = ((double) n - centre) / (double) oversample;
            const double sinc = (std::abs (t) < 1.0e-9) ? 1.0 : std::sin (kPi * t) / (kPi * t);
            const double r = ((double) n - centre) / centre;
            const double w = besselI0 (beta * std::sqrt (std::max (0.0, 1.0 - r * r))) / i0beta;
            h[(size_t) n] = sinc * w;
        }
        // Normalise each polyphase branch to unity DC gain so a constant passes unchanged.
        for (int p = 0; p < oversample; ++p)
        {
            double s = 0.0;
            for (int k = 0; k < kTapsPerPhase; ++k) s += h[(size_t) (k * oversample + p)];
            for (int k = 0; k < kTapsPerPhase; ++k)
                phase[(size_t) p][(size_t) k] = (float) (h[(size_t) (k * oversample + p)] / s);
        }
        // Branch p (taps h[k*F+p] against x[n-k]) is the interpolated value at base time
        // (n - kInterpDelay) + p/F, so the F branches cover the interval starting at x[n - kInterpDelay].
    }

    static double besselI0 (double x) noexcept
    {
        double sum = 1.0, term = 1.0;
        const double q = x * x * 0.25;
        for (int k = 1; k < 60; ++k)
        {
            term *= q / ((double) k * (double) k);
            sum += term;
            if (term < 1.0e-12 * sum) break;
        }
        return sum;
    }

    inline float slidingMin (float v) noexcept
    {
        // Monotonic deque: maintains minimum over the last (windowOs + 1) values.
        const long long idx = sampleIndex++;
        const auto cap = (long long) minDeque.size();
        while (dqTail != dqHead && minDeque[(size_t) ((dqTail + cap - 1) % cap)].value >= v)
            dqTail = (dqTail + cap - 1) % cap;
        minDeque[(size_t) dqTail] = { v, idx };
        dqTail = (dqTail + 1) % cap;
        while (minDeque[(size_t) dqHead].index <= idx - (windowOs + 1))
            dqHead = (dqHead + 1) % cap;
        return minDeque[(size_t) dqHead].value;
    }

    inline float boxAverage (float v) noexcept
    {
        boxSum += (double) v - (double) boxRing[(size_t) boxPos];
        boxRing[(size_t) boxPos] = v;
        if (++boxPos >= windowOs) boxPos = 0;
        if (++boxRefresh >= 65536)
        {
            boxRefresh = 0;
            double s = 0.0;
            for (float x : boxRing) s += x;
            boxSum = s;
        }
        return (float) std::min (1.0, std::max (0.0, boxSum / (double) windowOs));
    }

    double fs = 48000.0, fsOs = 384000.0;
    int oversample = 8, lookaheadSamples = 96, delaySamples = 112, windowOs = 768;
    float ceilingLin = 0.891f, releaseMs = 80.0f, releaseCoef = 0.0001f, releaseState = 1.0f;
    bool enabled = true;

    std::array<std::array<float, kTapsPerPhase>, kMaxOversample> phase {};
    std::array<std::array<float, kTapsPerPhase>, 2> history {};
    int histPos = 0;

    std::array<IntDelay, 2> dryDelay;

    std::vector<DqEntry> minDeque;
    long long dqHead = 0, dqTail = 0, sampleIndex = 0;

    std::vector<float> boxRing;
    int boxPos = 0, boxRefresh = 0;
    double boxSum = 0.0;

    std::atomic<float> minGainThisBlock { 1.0f };
};
} // namespace lm2::dsp
