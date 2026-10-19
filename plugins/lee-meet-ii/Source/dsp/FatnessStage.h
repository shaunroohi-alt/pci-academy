#pragma once
#include "Biquad.h"
#include "IntDelay.h"
#include <juce_dsp/juce_dsp.h>
#include <cmath>

namespace lm2::dsp
{
/**
    "Fatness": a 2x-oversampled soft saturator with low-shelf pre-emphasis, blended
    in parallel with the dry signal. Adds low-order harmonics and density. The dry
    path is delayed by the oversampler latency so the blend stays phase-coherent.
*/
class FatnessStage
{
public:
    void prepare (double sampleRate, int maxBlockSize)
    {
        fs = sampleRate;
        oversampler = std::make_unique<juce::dsp::Oversampling<float>> (
            2, 1, juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR, true, true);
        oversampler->initProcessing ((size_t) maxBlockSize);
        latency = (int) std::lround (oversampler->getLatencyInSamples());

        wet.setSize (2, maxBlockSize);
        for (auto& d : dryDelay) d.prepare (latency);
        setAmount (amount, true);
        reset();
    }

    void reset()
    {
        if (oversampler) oversampler->reset();
        for (auto& b : shelf) b.reset();
        for (auto& d : dryDelay) d.reset();
    }

    int getLatencySamples() const noexcept { return latency; }

    void setAmount (float amount01, bool force = false) noexcept
    {
        amount01 = juce::jlimit (0.0f, 1.0f, amount01);
        if (! force && std::abs (amount01 - amount) < 1.0e-6f) return;
        amount = amount01;
        drive = 1.0f + 2.0f * amount;
        norm  = 0.5f / std::tanh (drive * 0.5f);   // unity at -6 dBFS
        for (auto& b : shelf) b.setLowShelf (fs, 120.0, 0.7, 3.0 * amount);
    }

    void process (float* left, float* right, int numSamples) noexcept
    {
        float* chans[2] = { left, right };

        // delay dry
        for (int i = 0; i < numSamples; ++i)
        {
            for (int c = 0; c < 2; ++c)
            {
                const float in = chans[c][i];
                wet.setSample (c, i, in);
                chans[c][i] = dryDelay[(size_t) c].process (in);
            }
        }

        if (amount <= 0.0f)
        {
            // keep the oversampler state warm so enabling later does not click
            juce::dsp::AudioBlock<float> block (wet.getArrayOfWritePointers(), 2, (size_t) numSamples);
            auto up = oversampler->processSamplesUp (block);
            oversampler->processSamplesDown (block);
            juce::ignoreUnused (up);
            return;
        }

        for (int c = 0; c < 2; ++c)
        {
            auto* w = wet.getWritePointer (c);
            for (int i = 0; i < numSamples; ++i)
                w[i] = (float) shelf[(size_t) c].process ((double) w[i]);
        }

        juce::dsp::AudioBlock<float> block (wet.getArrayOfWritePointers(), 2, (size_t) numSamples);
        auto up = oversampler->processSamplesUp (block);
        for (size_t c = 0; c < up.getNumChannels(); ++c)
        {
            auto* s = up.getChannelPointer (c);
            for (size_t i = 0; i < up.getNumSamples(); ++i)
                s[i] = std::tanh (drive * s[i]) * norm;
        }
        oversampler->processSamplesDown (block);

        const float mix = amount;
        for (int c = 0; c < 2; ++c)
        {
            const float* w = wet.getReadPointer (c);
            float* d = chans[c];
            for (int i = 0; i < numSamples; ++i)
                d[i] = d[i] + mix * (w[i] - d[i]);
        }
    }

private:
    double fs = 48000.0;
    int latency = 0;
    float amount = 0.25f, drive = 1.5f, norm = 1.0f;
    std::unique_ptr<juce::dsp::Oversampling<float>> oversampler;
    juce::AudioBuffer<float> wet;
    Biquad shelf[2];
    std::array<IntDelay, 2> dryDelay;
};
} // namespace lm2::dsp
