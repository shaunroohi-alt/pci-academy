#pragma once
#include "Biquad.h"
#include <cmath>

namespace lm2::dsp
{
/** Mid/side encode -> independent presence bell on M and S -> width -> decode. */
class MidSideStage
{
public:
    void prepare (double sampleRate)
    {
        fs = sampleRate;
        update (freqHz, midDb, sideDb, true);
        reset();
    }

    void reset() { midEq.reset(); sideEq.reset(); }

    void setWidth (float width01to2) noexcept { width = std::max (0.0f, width01to2); }

    void update (float newFreqHz, float newMidDb, float newSideDb, bool force = false) noexcept
    {
        if (! force && std::abs (newFreqHz - freqHz) < 1.0e-3f && std::abs (newMidDb - midDb) < 1.0e-4f
                    && std::abs (newSideDb - sideDb) < 1.0e-4f) return;
        freqHz = newFreqHz; midDb = newMidDb; sideDb = newSideDb;
        midEq.setPeak (fs, freqHz, 0.8, midDb);
        sideEq.setPeak (fs, freqHz, 0.8, sideDb);
    }

    void process (float* left, float* right, int numSamples) noexcept
    {
        for (int i = 0; i < numSamples; ++i)
        {
            const double m = 0.5 * ((double) left[i] + (double) right[i]);
            const double s = 0.5 * ((double) left[i] - (double) right[i]);
            const double m2 = midEq.process (m);
            const double s2 = sideEq.process (s) * (double) width;
            left[i]  = (float) (m2 + s2);
            right[i] = (float) (m2 - s2);
        }
    }

private:
    double fs = 48000.0;
    float freqHz = 3000.0f, midDb = 0.0f, sideDb = 0.0f, width = 1.0f;
    Biquad midEq, sideEq;
};
} // namespace lm2::dsp
