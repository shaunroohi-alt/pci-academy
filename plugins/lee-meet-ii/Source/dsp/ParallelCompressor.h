#pragma once
#include "Biquad.h"
#include <atomic>
#include <algorithm>
#include <cmath>

namespace lm2::dsp
{
/**
    Stereo-linked feed-forward compressor with soft knee, blended in parallel
    ("New York" style). The detector can listen to the plugin's own signal or to an
    external side-chain, through a 2nd-order high-pass so low end does not pump it.
*/
class ParallelCompressor
{
public:
    void prepare (double sampleRate)
    {
        fs = sampleRate;
        setSidechainHighPass (hpfHz, true);
        setAttack (attackMs);
        setRelease (releaseMs);
        reset();
    }

    void reset()
    {
        for (auto& b : scFilter) b.reset();
        envelope = 0.0f;
        minGainThisBlock.store (1.0f);
    }

    void setThreshold (float dB) noexcept { thresholdDb = dB; }
    void setRatio (float r) noexcept { ratio = std::max (1.0f, r); }
    void setMakeup (float dB) noexcept { makeupLin = std::pow (10.0f, dB / 20.0f); }
    void setMix (float mix01) noexcept { mix = std::clamp (mix01, 0.0f, 1.0f); }

    void setAttack (float ms) noexcept
    {
        attackMs = ms;
        attackCoef = (float) (1.0 - std::exp (-1.0 / (std::max (0.01, (double) ms) * 0.001 * fs)));
    }

    void setRelease (float ms) noexcept
    {
        releaseMs = ms;
        releaseCoef = (float) (1.0 - std::exp (-1.0 / (std::max (1.0, (double) ms) * 0.001 * fs)));
    }

    void setSidechainHighPass (float hz, bool force = false) noexcept
    {
        if (! force && std::abs (hz - hpfHz) < 0.01f) return;
        hpfHz = hz;
        for (auto& b : scFilter) b.setHighPass (fs, hz, 0.7071);
    }

    float getAndResetGainReductionDb() noexcept
    {
        const float g = minGainThisBlock.exchange (1.0f);
        return 20.0f * std::log10 (std::max (g, 1.0e-5f));
    }

    /** Side-chain pointers may alias the main signal (internal detection). */
    void process (float* left, float* right, const float* scLeft, const float* scRight, int numSamples) noexcept
    {
        constexpr float kneeDb = 6.0f;
        const float slope = 1.0f / ratio - 1.0f;   // negative
        float blockMin = 1.0f;

        for (int i = 0; i < numSamples; ++i)
        {
            const float sl = (float) scFilter[0].process ((double) scLeft[i]);
            const float sr = (float) scFilter[1].process ((double) scRight[i]);
            const float level = std::max (std::abs (sl), std::abs (sr));

            const float coef = level > envelope ? attackCoef : releaseCoef;
            envelope += (level - envelope) * coef;

            const float envDb = 20.0f * std::log10 (std::max (envelope, 1.0e-6f));
            const float over = envDb - thresholdDb;
            float grDb;
            if (over <= -kneeDb * 0.5f)      grDb = 0.0f;
            else if (over >= kneeDb * 0.5f)  grDb = slope * over;
            else                             grDb = slope * (over + kneeDb * 0.5f) * (over + kneeDb * 0.5f) / (2.0f * kneeDb);

            const float gr = std::pow (10.0f, grDb / 20.0f);
            blockMin = std::min (blockMin, gr);

            const float wetGain = gr * makeupLin;
            const float g = 1.0f + mix * (wetGain - 1.0f);   // dry*(1-mix) + wet*mix
            left[i]  *= g;
            right[i] *= g;
        }
        float prev = minGainThisBlock.load();
        while (blockMin < prev && ! minGainThisBlock.compare_exchange_weak (prev, blockMin)) {}
    }

private:
    double fs = 48000.0;
    float thresholdDb = -24.0f, ratio = 4.0f, makeupLin = 1.0f, mix = 0.35f;
    float attackMs = 5.0f, releaseMs = 120.0f, attackCoef = 0.01f, releaseCoef = 0.001f;
    float hpfHz = 80.0f, envelope = 0.0f;
    Biquad scFilter[2];
    std::atomic<float> minGainThisBlock { 1.0f };
};
} // namespace lm2::dsp
