#pragma once
#include "LoudnessMeter.h"
#include <atomic>
#include <algorithm>
#include <cmath>

namespace lm2::dsp
{
/**
    Feed-forward loudness ("LUFS") control.

    Measures the K-weighted loudness of the incoming programme and applies a slow,
    smoothed gain so that it lands on the target LUFS before the master limiter.
    Feed-forward topology means it cannot oscillate. "Sensitivity" decides how eagerly
    quiet material is picked up: it blends the detector between short-term (3 s) and
    momentary (400 ms) loudness, shortens the gain time constant and widens the
    maximum boost. Below the silence gate the gain is held rather than ramped to
    maximum, so pauses do not pump the noise floor.
*/
class LoudnessControl
{
public:
    void prepare (double sampleRate)
    {
        fs = sampleRate;
        meter.prepare (sampleRate);
        reset();
    }

    void reset()
    {
        meter.reset();
        gainDb = 0.0f;
        currentGainDb.store (0.0f);
    }

    void setTargetLufs (float lufs) noexcept { targetLufs = lufs; }
    void setSensitivity (float s01) noexcept { sensitivity = std::clamp (s01, 0.0f, 1.0f); }
    void setEnabled (bool e) noexcept { enabled = e; }

    float getCurrentGainDb() const noexcept { return currentGainDb.load (std::memory_order_relaxed); }
    const LoudnessMeter& getMeter() const noexcept { return meter; }

    void process (float* left, float* right, int numSamples) noexcept
    {
        const float* chans[2] = { left, right };
        meter.process (chans, 2, numSamples);

        const float m  = meter.getMomentary();
        const float st = meter.getShortTerm();

        float desiredDb = gainDb;   // hold by default
        if (enabled)
        {
            const bool haveMomentary = m > LoudnessMeter::kSilence + 1.0f;
            const bool haveShort     = st > LoudnessMeter::kSilence + 1.0f;
            if (haveMomentary)
            {
                const float measured = haveShort ? (sensitivity * m + (1.0f - sensitivity) * st) : m;
                const float maxBoost = 6.0f + 18.0f * sensitivity;
                if (measured > kSilenceGateLufs)
                    desiredDb = std::clamp (targetLufs - measured, -24.0f, maxBoost);
            }
        }
        else
        {
            desiredDb = 0.0f;
        }

        // time constant: 4 s at 0 % sensitivity -> 150 ms at 100 %, per-sample one-pole
        const double tau = enabled ? std::exp (std::log (4.0) + (std::log (0.15) - std::log (4.0)) * (double) sensitivity) : 0.05;
        const float coef = (float) (1.0 - std::exp (-1.0 / (tau * fs)));

        for (int i = 0; i < numSamples; ++i)
        {
            gainDb += (desiredDb - gainDb) * coef;
            const float g = std::pow (10.0f, gainDb * (1.0f / 20.0f));
            left[i]  *= g;
            right[i] *= g;
        }
        currentGainDb.store (gainDb, std::memory_order_relaxed);
    }

private:
    static constexpr float kSilenceGateLufs = -55.0f;
    double fs = 48000.0;
    LoudnessMeter meter;
    float targetLufs = -14.0f, sensitivity = 0.6f, gainDb = 0.0f;
    bool enabled = true;
    std::atomic<float> currentGainDb { 0.0f };
};
} // namespace lm2::dsp
