/*
    Offline tests for Lee-Meet II. Drives the real AudioProcessor and the DSP
    classes with synthetic signals and checks the properties that matter for a
    mastering limiter: ceiling never exceeded (true peak), loudness meter
    calibration, reported latency correct, external side-chain actually drives
    the compressor, and state round-trips.
*/
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>
#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "dsp/LoudnessMeter.h"
#include "dsp/TruePeakLimiter.h"
#include <cstdio>
#include <random>

// The console app has no plugin wrapper; it includes the processor sources directly.
#include "../Source/PluginProcessor.cpp"
#include "../Source/PluginEditor.cpp"

namespace
{
int failures = 0;

void check (bool ok, const char* what, double a = 0.0, double b = 0.0)
{
    std::printf ("%s  %s   (%.4f / %.4f)\n", ok ? "[PASS]" : "[FAIL]", what, a, b);
    if (! ok) ++failures;
}

struct Params
{
    static void set (LeeMeetIIProcessor& p, const char* id, float value)
    {
        auto* param = p.apvts.getParameter (id);
        jassert (param != nullptr);
        param->setValueNotifyingHost (param->convertTo0to1 (value));
    }

    /** Everything neutral: no fatness, no comp, no M/S, LUFS control off, limiter on. */
    static void neutral (LeeMeetIIProcessor& p)
    {
        using namespace lm2::id;
        set (p, inputGain, 0.0f);  set (p, fatness, 0.0f);   set (p, width, 100.0f);
        set (p, midPresence, 0.0f); set (p, sidePresence, 0.0f);
        set (p, compMix, 0.0f);    set (p, lufsAuto, 0.0f); set (p, limEnabled, 1.0f);
        set (p, ceiling, -1.0f);   set (p, scListen, 0.0f); set (p, bypass, 0.0f);
    }
};

/** Runs a stereo signal through the processor in fixed-size blocks, returns the output. */
juce::AudioBuffer<float> run (LeeMeetIIProcessor& p, const juce::AudioBuffer<float>& input,
                              const juce::AudioBuffer<float>* sidechain, double fs, int block)
{
    p.enableAllBuses();                      // main stereo + stereo side-chain
    p.setRateAndBufferSizeDetails (fs, block);
    p.prepareToPlay (fs, block);
    const int n = input.getNumSamples();
    juce::AudioBuffer<float> out (2, n);
    const int totalCh = p.getTotalNumInputChannels();   // main + sidechain
    juce::AudioBuffer<float> io (juce::jmax (totalCh, 2), block);
    juce::MidiBuffer midi;
    for (int pos = 0; pos < n; pos += block)
    {
        const int len = juce::jmin (block, n - pos);
        io.clear();
        for (int c = 0; c < 2; ++c) io.copyFrom (c, 0, input, c, pos, len);
        if (sidechain != nullptr && totalCh >= 4)
            for (int c = 0; c < 2; ++c) io.copyFrom (2 + c, 0, *sidechain, c, pos, len);
        juce::AudioBuffer<float> view (io.getArrayOfWritePointers(), io.getNumChannels(), len);
        p.processBlock (view, midi);
        for (int c = 0; c < 2; ++c) out.copyFrom (c, pos, view, c, 0, len);
    }
    return out;
}

juce::AudioBuffer<float> sine (double fs, int n, float freq, float ampL, float ampR)
{
    juce::AudioBuffer<float> b (2, n);
    for (int i = 0; i < n; ++i)
    {
        const float v = std::sin (2.0f * juce::MathConstants<float>::pi * freq * (float) i / (float) fs);
        b.setSample (0, i, ampL * v);
        b.setSample (1, i, ampR * v);
    }
    return b;
}

/** Reference true-peak: 8x oversampled with a long windowed sinc. */
float truePeakDb (const juce::AudioBuffer<float>& b)
{
    constexpr int os = 8, half = 32;
    float peak = 0.0f;
    for (int c = 0; c < b.getNumChannels(); ++c)
    {
        const float* x = b.getReadPointer (c);
        const int n = b.getNumSamples();
        for (int i = half; i < n - half; ++i)
            for (int p = 0; p < os; ++p)
            {
                const double t = (double) p / os;
                double acc = 0.0;
                for (int k = -half; k < half; ++k)
                {
                    const double u = (double) k - t;
                    const double s = std::abs (u) < 1e-9 ? 1.0 : std::sin (M_PI * u) / (M_PI * u);
                    const double w = 0.5 + 0.5 * std::cos (M_PI * u / half);
                    acc += x[i + k] * s * w;
                }
                peak = juce::jmax (peak, (float) std::abs (acc));
            }
    }
    return juce::Decibels::gainToDecibels (peak, -120.0f);
}

float samplePeakDb (const juce::AudioBuffer<float>& b, int from = 0)
{
    float m = 0.0f;
    for (int c = 0; c < b.getNumChannels(); ++c)
        for (int i = from; i < b.getNumSamples(); ++i) m = juce::jmax (m, std::abs (b.getSample (c, i)));
    return juce::Decibels::gainToDecibels (m, -120.0f);
}

void testLoudnessMeterCalibration()
{
    // EBU Tech 3341 case 1: 997 Hz stereo sine at -23 dBFS -> -23.0 LUFS (+/- 0.1)
    for (double fs : { 44100.0, 48000.0, 96000.0 })
    {
        lm2::dsp::LoudnessMeter m;
        m.prepare (fs);
        auto s = sine (fs, (int) (fs * 10), 997.0f, juce::Decibels::decibelsToGain (-23.0f), juce::Decibels::decibelsToGain (-23.0f));
        const float* chans[2] = { s.getReadPointer (0), s.getReadPointer (1) };
        m.process (chans, 2, s.getNumSamples());
        check (std::abs (m.getIntegrated() + 23.0f) < 0.1f, "Loudness meter: -23 dBFS 997 Hz sine reads -23 LUFS (integrated)", m.getIntegrated(), fs);
        check (std::abs (m.getShortTerm() + 23.0f) < 0.1f, "Loudness meter: short-term", m.getShortTerm(), fs);
        check (std::abs (m.getMomentary() + 23.0f) < 0.1f, "Loudness meter: momentary", m.getMomentary(), fs);
    }

    // Gating: -23 LUFS tone with a long -60 LUFS tail must still integrate to -23 (relative gate).
    {
        const double fs = 48000.0;
        lm2::dsp::LoudnessMeter m;
        m.prepare (fs);
        auto loud  = sine (fs, (int) fs * 10, 997.0f, juce::Decibels::decibelsToGain (-23.0f), juce::Decibels::decibelsToGain (-23.0f));
        auto quiet = sine (fs, (int) fs * 20, 997.0f, juce::Decibels::decibelsToGain (-60.0f), juce::Decibels::decibelsToGain (-60.0f));
        const float* a[2] = { loud.getReadPointer (0), loud.getReadPointer (1) };
        const float* b[2] = { quiet.getReadPointer (0), quiet.getReadPointer (1) };
        m.process (a, 2, loud.getNumSamples());
        m.process (b, 2, quiet.getNumSamples());
        check (std::abs (m.getIntegrated() + 23.0f) < 0.1f, "Loudness meter: relative gate ignores quiet tail", m.getIntegrated());
    }
}

void testLimiterCeiling()
{
    const double fs = 48000.0;
    for (float ceilingDb : { -0.3f, -1.0f, -3.0f })
    {
        LeeMeetIIProcessor p;
        Params::neutral (p);
        Params::set (p, lm2::id::ceiling, ceilingDb);
        Params::set (p, lm2::id::inputGain, 12.0f);   // slam it
        Params::set (p, lm2::id::limRelease, 50.0f);

        // Nasty programme: 1 kHz + 11 kHz + band-limited noise bursts + impulses, hot.
        // (Noise is 4-tap averaged: nulls at fs/4 and fs/2, like real material that has
        // no energy at Nyquist, where "true peak" depends on the reconstruction filter.)
        const int n = (int) fs * 4;
        juce::AudioBuffer<float> in (2, n);
        std::mt19937 rng (42);
        std::uniform_real_distribution<float> uni (-1.0f, 1.0f);
        float nzL[4] = {}, nzR[4] = {};
        for (int i = 0; i < n; ++i)
        {
            const float t = (float) i / (float) fs;
            float v = 0.7f * std::sin (2.0f * juce::MathConstants<float>::pi * 1000.0f * t)
                    + 0.5f * std::sin (2.0f * juce::MathConstants<float>::pi * 11000.0f * t);
            const bool burst = ((i / 4800) % 3) == 0;
            nzL[i & 3] = uni (rng); nzR[i & 3] = uni (rng);
            const float noiseL = 0.25f * (nzL[0] + nzL[1] + nzL[2] + nzL[3]);
            const float noiseR = 0.25f * (nzR[0] + nzR[1] + nzR[2] + nzR[3]);
            if (burst) v += 1.8f * noiseL;
            if (i % 12000 == 0) v = 1.0f;   // isolated full-scale impulses
            in.setSample (0, i, v);
            in.setSample (1, i, -0.8f * v + (burst ? 0.6f * noiseR : 0.0f));
        }

        auto out = run (p, in, nullptr, fs, 256);
        const float sp = samplePeakDb (out);
        const float tp = truePeakDb (out);
        check (sp <= ceilingDb + 0.01f, "Limiter: sample peak <= ceiling", sp, ceilingDb);
        check (tp <= ceilingDb + 0.2f, "Limiter: true peak within 0.2 dB of ceiling (8x reference)", tp, ceilingDb);
        check (sp > ceilingDb - 1.5f, "Limiter: actually reaches the ceiling (not just attenuating)", sp, ceilingDb);
    }
}

void testLatencyAndTransparency()
{
    const double fs = 44100.0;
    LeeMeetIIProcessor p;
    Params::neutral (p);
    const int n = 8192;
    juce::AudioBuffer<float> in (2, n);
    in.clear();
    in.setSample (0, 1000, 0.5f);
    in.setSample (1, 1000, -0.5f);
    // plus a quiet sine so the signal is "normal" around the impulse
    auto out = run (p, in, nullptr, fs, 512);
    const int latency = p.getLatencySamples();

    int argmax = 0; float best = 0.0f;
    for (int i = 0; i < n; ++i)
        if (std::abs (out.getSample (0, i)) > best) { best = std::abs (out.getSample (0, i)); argmax = i; }

    check (argmax == 1000 + latency, "Reported latency matches measured impulse delay", argmax - 1000, latency);
    check (std::abs (best - 0.5f) < 0.001f, "Impulse under the ceiling passes bit-transparent (amplitude)", best, 0.5);

    // sine below ceiling: output == delayed input
    auto s = sine (fs, n, 440.0f, 0.3f, 0.2f);
    auto o = run (p, s, nullptr, fs, 64);
    double maxErr = 0.0;
    for (int i = 2000; i < n; ++i)
        maxErr = juce::jmax (maxErr, (double) std::abs (o.getSample (0, i) - s.getSample (0, i - latency)));
    check (maxErr < 1.0e-5, "Sub-ceiling sine passes unchanged apart from delay", maxErr);

    // bypass path is latency compensated too
    Params::set (p, lm2::id::bypass, 1.0f);
    auto ob = run (p, s, nullptr, fs, 128);
    maxErr = 0.0;
    for (int i = 2000; i < n; ++i)
        maxErr = juce::jmax (maxErr, (double) std::abs (ob.getSample (1, i) - s.getSample (1, i - latency)));
    check (maxErr < 1.0e-6, "Bypass is latency-compensated", maxErr);
}

void testSidechain()
{
    const double fs = 48000.0;
    const int n = (int) fs * 2;
    auto quiet = sine (fs, n, 200.0f, 0.05f, 0.05f);     // -26 dBFS programme
    auto loud  = sine (fs, n, 1000.0f, 0.9f, 0.9f);      // external key

    auto measureTail = [] (const juce::AudioBuffer<float>& b) { return samplePeakDb (b, b.getNumSamples() - 4800); };

    LeeMeetIIProcessor p;
    Params::neutral (p);
    Params::set (p, lm2::id::compMix, 100.0f);
    Params::set (p, lm2::id::compThreshold, -40.0f);
    Params::set (p, lm2::id::compRatio, 10.0f);
    Params::set (p, lm2::id::compMakeup, 0.0f);
    Params::set (p, lm2::id::scSource, 1.0f);   // External

    auto withKey = run (p, quiet, &loud, fs, 256);
    juce::AudioBuffer<float> silence (2, n); silence.clear();
    auto withoutKey = run (p, quiet, &silence, fs, 256);

    const float a = measureTail (withKey), b = measureTail (withoutKey);
    check (b - a > 6.0f, "External side-chain drives gain reduction (key loud vs silent)", a, b);
    check (std::abs (b - (-26.0f)) < 0.3f, "Quiet programme untouched when key is silent", b, -26.0);

    // Internal detection with a loud programme reduces gain, mix 0 does nothing
    Params::set (p, lm2::id::scSource, 0.0f);
    auto internalLoud = run (p, sine (fs, n, 200.0f, 0.5f, 0.5f), nullptr, fs, 256);
    check (measureTail (internalLoud) < -6.0f - 6.0f, "Internal side-chain compresses loud programme", measureTail (internalLoud), -6.0);
}

void testLoudnessControl()
{
    const double fs = 48000.0;
    const int n = (int) fs * 12;
    LeeMeetIIProcessor p;
    Params::neutral (p);
    Params::set (p, lm2::id::lufsAuto, 1.0f);
    Params::set (p, lm2::id::lufsTarget, -16.0f);
    Params::set (p, lm2::id::sensitivity, 80.0f);
    Params::set (p, lm2::id::ceiling, -0.3f);
    // -30 LUFS programme (stereo sine at -30 dBFS == -30 LUFS at 1 kHz)
    auto s = sine (fs, n, 997.0f, juce::Decibels::decibelsToGain (-30.0f), juce::Decibels::decibelsToGain (-30.0f));
    auto out = run (p, s, nullptr, fs, 512);

    lm2::dsp::LoudnessMeter m; m.prepare (fs);
    const float* chans[2] = { out.getReadPointer (0) + n / 2, out.getReadPointer (1) + n / 2 };
    m.process (chans, 2, n / 2);
    check (std::abs (m.getIntegrated() + 16.0f) < 0.5f, "LUFS control lands a -30 LUFS source on -16 LUFS target", m.getIntegrated(), -16.0);
}

void testStateRoundTrip()
{
    LeeMeetIIProcessor a, b;
    Params::set (a, lm2::id::fatness, 71.0f);
    Params::set (a, lm2::id::ceiling, -2.3f);
    Params::set (a, lm2::id::scSource, 1.0f);
    juce::MemoryBlock state;
    a.getStateInformation (state);
    b.setStateInformation (state.getData(), (int) state.getSize());
    check (std::abs (b.apvts.getRawParameterValue (lm2::id::fatness)->load() - 71.0f) < 0.01f, "State round-trip: fatness");
    check (std::abs (b.apvts.getRawParameterValue (lm2::id::ceiling)->load() + 2.3f) < 0.01f, "State round-trip: ceiling");
    check (std::abs (b.apvts.getRawParameterValue (lm2::id::scSource)->load() - 1.0f) < 0.01f, "State round-trip: side-chain source");
}

void testMonoAndSilence()
{
    // Mono in/out layout is accepted and silence produces silence (no DC, no denormal garbage).
    LeeMeetIIProcessor p;
    juce::AudioProcessor::BusesLayout layout;
    layout.inputBuses.add (juce::AudioChannelSet::mono());
    layout.inputBuses.add (juce::AudioChannelSet::stereo());
    layout.outputBuses.add (juce::AudioChannelSet::mono());
    check (p.checkBusesLayoutSupported (layout), "Mono main bus layout supported");
    juce::AudioProcessor::BusesLayout bad = layout;
    bad.outputBuses.set (0, juce::AudioChannelSet::create5point1());
    check (! p.checkBusesLayoutSupported (bad), "Mismatched surround layout rejected");

    Params::neutral (p);
    Params::set (p, lm2::id::fatness, 100.0f);
    Params::set (p, lm2::id::lufsAuto, 1.0f);
    juce::AudioBuffer<float> silence (2, 48000); silence.clear();
    auto out = run (p, silence, nullptr, 48000.0, 480);
    check (samplePeakDb (out) < -100.0f, "Silence in, silence out", samplePeakDb (out));
}
} // namespace

int main()
{
    juce::ScopedJuceInitialiser_GUI juceInit;
    std::printf ("Lee-Meet II DSP tests\n=====================\n");
    testLoudnessMeterCalibration();
    testLimiterCeiling();
    testLatencyAndTransparency();
    testSidechain();
    testLoudnessControl();
    testStateRoundTrip();
    testMonoAndSilence();
    std::printf ("\n%s (%d failure%s)\n", failures == 0 ? "ALL TESTS PASSED" : "TESTS FAILED", failures, failures == 1 ? "" : "s");
    return failures == 0 ? 0 : 1;
}
