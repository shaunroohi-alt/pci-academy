#pragma once
#include <juce_audio_processors/juce_audio_processors.h>

namespace lm2::id
{
inline constexpr const char* inputGain     = "inputGain";
inline constexpr const char* sensitivity   = "sensitivity";
inline constexpr const char* lufsAuto      = "lufsAuto";
inline constexpr const char* lufsTarget    = "lufsTarget";
inline constexpr const char* fatness       = "fatness";
inline constexpr const char* width         = "width";
inline constexpr const char* presenceFreq  = "presenceFreq";
inline constexpr const char* midPresence   = "midPresence";
inline constexpr const char* sidePresence  = "sidePresence";
inline constexpr const char* compThreshold = "compThreshold";
inline constexpr const char* compRatio     = "compRatio";
inline constexpr const char* compAttack    = "compAttack";
inline constexpr const char* compRelease   = "compRelease";
inline constexpr const char* compMakeup    = "compMakeup";
inline constexpr const char* compMix       = "compMix";
inline constexpr const char* scSource      = "scSource";
inline constexpr const char* scHpf         = "scHpf";
inline constexpr const char* scListen      = "scListen";
inline constexpr const char* ceiling       = "ceiling";
inline constexpr const char* limRelease    = "limRelease";
inline constexpr const char* limEnabled    = "limEnabled";
inline constexpr const char* bypass        = "bypass";
} // namespace lm2::id

namespace lm2
{
inline juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout()
{
    using namespace juce;
    using P = AudioParameterFloat;
    std::vector<std::unique_ptr<RangedAudioParameter>> p;

    auto db = [] (float v, int) { return String (v, 1) + " dB"; };
    auto pct = [] (float v, int) { return String ((int) std::round (v)) + " %"; };
    auto ms = [] (float v, int) { return v < 10.0f ? String (v, 2) + " ms" : String (v, 1) + " ms"; };
    auto hz = [] (float v, int) { return v >= 1000.0f ? String (v / 1000.0f, 2) + " kHz" : String ((int) std::round (v)) + " Hz"; };

    // Input
    p.push_back (std::make_unique<P> (ParameterID { id::inputGain, 1 }, "Input Gain",
        NormalisableRange<float> (-24.0f, 24.0f, 0.1f), 0.0f, AudioParameterFloatAttributes().withStringFromValueFunction (db)));
    p.push_back (std::make_unique<P> (ParameterID { id::sensitivity, 1 }, "Sensitivity",
        NormalisableRange<float> (0.0f, 100.0f, 1.0f), 60.0f, AudioParameterFloatAttributes().withStringFromValueFunction (pct)));

    // LUFS control
    p.push_back (std::make_unique<AudioParameterBool> (ParameterID { id::lufsAuto, 1 }, "LUFS Control", true));
    p.push_back (std::make_unique<P> (ParameterID { id::lufsTarget, 1 }, "Target Loudness",
        NormalisableRange<float> (-30.0f, -6.0f, 0.1f), -14.0f,
        AudioParameterFloatAttributes().withStringFromValueFunction ([] (float v, int) { return String (v, 1) + " LUFS"; })));

    // Fatness
    p.push_back (std::make_unique<P> (ParameterID { id::fatness, 1 }, "Fatness",
        NormalisableRange<float> (0.0f, 100.0f, 1.0f), 25.0f, AudioParameterFloatAttributes().withStringFromValueFunction (pct)));

    // Mid/Side
    p.push_back (std::make_unique<P> (ParameterID { id::width, 1 }, "Width",
        NormalisableRange<float> (0.0f, 200.0f, 1.0f), 100.0f, AudioParameterFloatAttributes().withStringFromValueFunction (pct)));
    p.push_back (std::make_unique<P> (ParameterID { id::presenceFreq, 1 }, "Presence Freq",
        NormalisableRange<float> (1000.0f, 8000.0f, 1.0f, 0.5f), 3000.0f, AudioParameterFloatAttributes().withStringFromValueFunction (hz)));
    p.push_back (std::make_unique<P> (ParameterID { id::midPresence, 1 }, "Mid Presence",
        NormalisableRange<float> (-12.0f, 12.0f, 0.1f), 0.0f, AudioParameterFloatAttributes().withStringFromValueFunction (db)));
    p.push_back (std::make_unique<P> (ParameterID { id::sidePresence, 1 }, "Side Presence",
        NormalisableRange<float> (-12.0f, 12.0f, 0.1f), 0.0f, AudioParameterFloatAttributes().withStringFromValueFunction (db)));

    // Parallel compression / side-chain
    p.push_back (std::make_unique<P> (ParameterID { id::compThreshold, 1 }, "Comp Threshold",
        NormalisableRange<float> (-60.0f, 0.0f, 0.1f), -24.0f, AudioParameterFloatAttributes().withStringFromValueFunction (db)));
    p.push_back (std::make_unique<P> (ParameterID { id::compRatio, 1 }, "Comp Ratio",
        NormalisableRange<float> (1.0f, 20.0f, 0.1f, 0.5f), 4.0f,
        AudioParameterFloatAttributes().withStringFromValueFunction ([] (float v, int) { return String (v, 1) + ":1"; })));
    p.push_back (std::make_unique<P> (ParameterID { id::compAttack, 1 }, "Comp Attack",
        NormalisableRange<float> (0.1f, 100.0f, 0.01f, 0.4f), 5.0f, AudioParameterFloatAttributes().withStringFromValueFunction (ms)));
    p.push_back (std::make_unique<P> (ParameterID { id::compRelease, 1 }, "Comp Release",
        NormalisableRange<float> (10.0f, 1000.0f, 1.0f, 0.4f), 120.0f, AudioParameterFloatAttributes().withStringFromValueFunction (ms)));
    p.push_back (std::make_unique<P> (ParameterID { id::compMakeup, 1 }, "Comp Makeup",
        NormalisableRange<float> (0.0f, 18.0f, 0.1f), 0.0f, AudioParameterFloatAttributes().withStringFromValueFunction (db)));
    p.push_back (std::make_unique<P> (ParameterID { id::compMix, 1 }, "Comp Mix",
        NormalisableRange<float> (0.0f, 100.0f, 1.0f), 35.0f, AudioParameterFloatAttributes().withStringFromValueFunction (pct)));
    p.push_back (std::make_unique<AudioParameterChoice> (ParameterID { id::scSource, 1 }, "Sidechain Source",
        StringArray { "Internal", "External" }, 0));
    p.push_back (std::make_unique<P> (ParameterID { id::scHpf, 1 }, "Sidechain HPF",
        NormalisableRange<float> (20.0f, 500.0f, 1.0f, 0.5f), 80.0f, AudioParameterFloatAttributes().withStringFromValueFunction (hz)));
    p.push_back (std::make_unique<AudioParameterBool> (ParameterID { id::scListen, 1 }, "Sidechain Listen", false));

    // Master limiter
    p.push_back (std::make_unique<P> (ParameterID { id::ceiling, 1 }, "Ceiling",
        NormalisableRange<float> (-6.0f, 0.0f, 0.1f), -1.0f,
        AudioParameterFloatAttributes().withStringFromValueFunction ([] (float v, int) { return String (v, 1) + " dBTP"; })));
    p.push_back (std::make_unique<P> (ParameterID { id::limRelease, 1 }, "Limiter Release",
        NormalisableRange<float> (5.0f, 1000.0f, 1.0f, 0.4f), 80.0f, AudioParameterFloatAttributes().withStringFromValueFunction (ms)));
    p.push_back (std::make_unique<AudioParameterBool> (ParameterID { id::limEnabled, 1 }, "Limiter", true));

    p.push_back (std::make_unique<AudioParameterBool> (ParameterID { id::bypass, 1 }, "Bypass", false));

    return { p.begin(), p.end() };
}
} // namespace lm2
