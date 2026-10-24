#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include "Parameters.h"
#include "dsp/FatnessStage.h"
#include "dsp/MidSideStage.h"
#include "dsp/ParallelCompressor.h"
#include "dsp/LoudnessControl.h"
#include "dsp/LoudnessMeter.h"
#include "dsp/TruePeakLimiter.h"
#include "dsp/IntDelay.h"

/**
    Lee-Meet II by MP Audio — mastering limiter / maximizer.

    Signal chain:  Input gain -> Fatness -> Mid/Side presence & width
                   -> Parallel compression (int/ext side-chain) -> LUFS control
                   -> True-peak master limiter -> Output.
*/
class LeeMeetIIProcessor : public juce::AudioProcessor
{
public:
    LeeMeetIIProcessor();
    ~LeeMeetIIProcessor() override = default;

    //==============================================================================
    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    using AudioProcessor::processBlock;
    using AudioProcessor::processBlockBypassed;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void processBlockBypassed (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    //==============================================================================
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }
    juce::AudioProcessorParameter* getBypassParameter() const override { return bypassParam; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return "Default"; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    //==============================================================================
    juce::AudioProcessorValueTreeState apvts;

    /** Metering snapshot for the editor (all atomics; read from the UI thread). */
    struct Meters
    {
        std::atomic<float> inPeakL { 0.0f }, inPeakR { 0.0f }, outPeakL { 0.0f }, outPeakR { 0.0f };
        std::atomic<float> compGrDb { 0.0f }, limGrDb { 0.0f }, autoGainDb { 0.0f };
        std::atomic<float> momentary { -120.0f }, shortTerm { -120.0f }, integrated { -120.0f };
    };
    Meters meters;

    void resetLoudnessMeters() { resetMetersFlag.store (true); }

private:
    template <typename T> T* param (const char* id) { return dynamic_cast<T*> (apvts.getParameter (id)); }
    void updateParameters();
    void processCore (juce::AudioBuffer<float>& buffer, const juce::AudioBuffer<float>* sidechain);
    static void updatePeak (std::atomic<float>& target, const float* data, int n) noexcept;

    juce::AudioParameterFloat *inputGainP, *sensitivityP, *lufsTargetP, *fatnessP, *widthP, *presenceFreqP,
        *midPresenceP, *sidePresenceP, *compThresholdP, *compRatioP, *compAttackP, *compReleaseP, *compMakeupP,
        *compMixP, *scHpfP, *ceilingP, *limReleaseP;
    juce::AudioParameterBool *lufsAutoP, *scListenP, *limEnabledP, *bypassParam;
    juce::AudioParameterChoice* scSourceP;

    lm2::dsp::FatnessStage fatness;
    lm2::dsp::MidSideStage midSide;
    lm2::dsp::ParallelCompressor compressor;
    lm2::dsp::LoudnessControl loudnessControl;
    lm2::dsp::TruePeakLimiter limiter;
    lm2::dsp::LoudnessMeter outputMeter;

    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Multiplicative> inputGainSmoothed { 1.0f };
    juce::AudioBuffer<float> work, scWork;
    lm2::dsp::IntDelay bypassDelay[2];
    int totalLatency = 0;
    std::atomic<bool> resetMetersFlag { false };
    double currentSampleRate = 48000.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (LeeMeetIIProcessor)
};
