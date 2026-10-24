#include "PluginProcessor.h"
#include "PluginEditor.h"

LeeMeetIIProcessor::LeeMeetIIProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true)
                          .withInput ("Sidechain", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "LeeMeetII", lm2::createParameterLayout())
{
    using namespace lm2;
    inputGainP     = param<juce::AudioParameterFloat> (id::inputGain);
    sensitivityP   = param<juce::AudioParameterFloat> (id::sensitivity);
    lufsTargetP    = param<juce::AudioParameterFloat> (id::lufsTarget);
    fatnessP       = param<juce::AudioParameterFloat> (id::fatness);
    widthP         = param<juce::AudioParameterFloat> (id::width);
    presenceFreqP  = param<juce::AudioParameterFloat> (id::presenceFreq);
    midPresenceP   = param<juce::AudioParameterFloat> (id::midPresence);
    sidePresenceP  = param<juce::AudioParameterFloat> (id::sidePresence);
    compThresholdP = param<juce::AudioParameterFloat> (id::compThreshold);
    compRatioP     = param<juce::AudioParameterFloat> (id::compRatio);
    compAttackP    = param<juce::AudioParameterFloat> (id::compAttack);
    compReleaseP   = param<juce::AudioParameterFloat> (id::compRelease);
    compMakeupP    = param<juce::AudioParameterFloat> (id::compMakeup);
    compMixP       = param<juce::AudioParameterFloat> (id::compMix);
    scHpfP         = param<juce::AudioParameterFloat> (id::scHpf);
    ceilingP       = param<juce::AudioParameterFloat> (id::ceiling);
    limReleaseP    = param<juce::AudioParameterFloat> (id::limRelease);
    lufsAutoP      = param<juce::AudioParameterBool> (id::lufsAuto);
    scListenP      = param<juce::AudioParameterBool> (id::scListen);
    limEnabledP    = param<juce::AudioParameterBool> (id::limEnabled);
    bypassParam    = param<juce::AudioParameterBool> (id::bypass);
    scSourceP      = param<juce::AudioParameterChoice> (id::scSource);
}

//==============================================================================
bool LeeMeetIIProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto mainIn  = layouts.getMainInputChannelSet();
    const auto mainOut = layouts.getMainOutputChannelSet();
    if (mainIn != mainOut) return false;
    if (mainIn != juce::AudioChannelSet::stereo() && mainIn != juce::AudioChannelSet::mono()) return false;

    if (layouts.inputBuses.size() > 1)
    {
        const auto sc = layouts.inputBuses[1];
        if (! sc.isDisabled() && sc != juce::AudioChannelSet::stereo() && sc != juce::AudioChannelSet::mono())
            return false;
    }
    return true;
}

void LeeMeetIIProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    const int block = juce::jmax (16, samplesPerBlock);

    fatness.prepare (sampleRate, block);
    midSide.prepare (sampleRate);
    compressor.prepare (sampleRate);
    loudnessControl.prepare (sampleRate);
    limiter.prepare (sampleRate, 2.0);
    outputMeter.prepare (sampleRate);

    inputGainSmoothed.reset (sampleRate, 0.02);
    inputGainSmoothed.setCurrentAndTargetValue (juce::Decibels::decibelsToGain (inputGainP->get()));

    work.setSize (2, block);
    scWork.setSize (2, block);

    totalLatency = fatness.getLatencySamples() + limiter.getLatencySamples();
    for (auto& d : bypassDelay) d.prepare (totalLatency);
    setLatencySamples (totalLatency);

    updateParameters();
}

void LeeMeetIIProcessor::updateParameters()
{
    inputGainSmoothed.setTargetValue (juce::Decibels::decibelsToGain (inputGainP->get()));
    fatness.setAmount (fatnessP->get() * 0.01f);
    midSide.setWidth (widthP->get() * 0.01f);
    midSide.update (presenceFreqP->get(), midPresenceP->get(), sidePresenceP->get());
    compressor.setThreshold (compThresholdP->get());
    compressor.setRatio (compRatioP->get());
    compressor.setAttack (compAttackP->get());
    compressor.setRelease (compReleaseP->get());
    compressor.setMakeup (compMakeupP->get());
    compressor.setMix (compMixP->get() * 0.01f);
    compressor.setSidechainHighPass (scHpfP->get());
    loudnessControl.setTargetLufs (lufsTargetP->get());
    loudnessControl.setSensitivity (sensitivityP->get() * 0.01f);
    loudnessControl.setEnabled (lufsAutoP->get());
    limiter.setCeilingDb (ceilingP->get());
    limiter.setRelease (limReleaseP->get());
    limiter.setEnabled (limEnabledP->get());
}

void LeeMeetIIProcessor::updatePeak (std::atomic<float>& target, const float* data, int n) noexcept
{
    float m = 0.0f;
    for (int i = 0; i < n; ++i) m = juce::jmax (m, std::abs (data[i]));
    float prev = target.load();
    while (m > prev && ! target.compare_exchange_weak (prev, m)) {}
}

void LeeMeetIIProcessor::processBlockBypassed (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    // Latency-compensated pass-through so toggling bypass does not shift the timeline.
    auto mainIn  = getBusBuffer (buffer, true, 0);
    auto mainOut = getBusBuffer (buffer, false, 0);
    const int n = buffer.getNumSamples();
    const int nch = juce::jmin (mainIn.getNumChannels(), mainOut.getNumChannels(), 2);
    for (int c = 0; c < nch; ++c)
    {
        const float* in = mainIn.getReadPointer (c);
        float* out = mainOut.getWritePointer (c);
        auto& d = bypassDelay[c];
        for (int i = 0; i < n; ++i)
            out[i] = d.process (in[i]);
    }
}

void LeeMeetIIProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;

    if (bypassParam->get())
    {
        processBlockBypassed (buffer, midi);
        return;
    }

    if (getBusCount (true) > 1 && getBus (true, 1)->isEnabled())
    {
        auto scBus = getBusBuffer (buffer, true, 1);   // non-owning view, no allocation
        processCore (buffer, scBus.getNumChannels() > 0 ? &scBus : nullptr);
        return;
    }
    processCore (buffer, nullptr);
}

void LeeMeetIIProcessor::processCore (juce::AudioBuffer<float>& buffer, const juce::AudioBuffer<float>* sidechain)
{
    auto mainIn  = getBusBuffer (buffer, true, 0);
    auto mainOut = getBusBuffer (buffer, false, 0);
    const int n = buffer.getNumSamples();
    if (n == 0) return;
    if (n > work.getNumSamples()) { work.setSize (2, n, false, false, true); scWork.setSize (2, n, false, false, true); }

    if (resetMetersFlag.exchange (false))
        outputMeter.reset();

    updateParameters();

    // --- gather stereo working copy (mono is duplicated)
    const int inCh = mainIn.getNumChannels();
    for (int c = 0; c < 2; ++c)
        work.copyFrom (c, 0, mainIn, juce::jmin (c, inCh - 1), 0, n);

    float* L = work.getWritePointer (0);
    float* R = work.getWritePointer (1);

    updatePeak (meters.inPeakL, L, n);
    updatePeak (meters.inPeakR, R, n);

    // --- input gain
    for (int i = 0; i < n; ++i)
    {
        const float g = inputGainSmoothed.getNextValue();
        L[i] *= g; R[i] *= g;
    }

    // --- side-chain source
    const bool external = scSourceP->getIndex() == 1 && sidechain != nullptr;
    const float* scL = L;
    const float* scR = R;
    if (external)
    {
        const int scCh = sidechain->getNumChannels();
        for (int c = 0; c < 2; ++c)
            scWork.copyFrom (c, 0, *sidechain, juce::jmin (c, scCh - 1), 0, n);
        scL = scWork.getReadPointer (0);
        scR = scWork.getReadPointer (1);
    }

    if (scListenP->get())
    {
        // Monitor whatever the compressor is listening to.
        if (! external) { scWork.copyFrom (0, 0, L, n); scWork.copyFrom (1, 0, R, n); }
        for (int c = 0; c < mainOut.getNumChannels() && c < 2; ++c)
            mainOut.copyFrom (c, 0, scWork, c, 0, n);
        return;
    }

    // --- chain
    fatness.process (L, R, n);
    midSide.process (L, R, n);
    if (external)
        compressor.process (L, R, scL, scR, n);
    else
        compressor.process (L, R, L, R, n);   // internal detection uses the post-M/S signal
    loudnessControl.process (L, R, n);
    limiter.process (L, R, n);

    // --- metering
    meters.compGrDb.store (compressor.getAndResetGainReductionDb());
    meters.limGrDb.store (limiter.getAndResetGainReductionDb());
    meters.autoGainDb.store (loudnessControl.getCurrentGainDb());
    const float* outChans[2] = { L, R };
    outputMeter.process (outChans, 2, n);
    meters.momentary.store (outputMeter.getMomentary());
    meters.shortTerm.store (outputMeter.getShortTerm());
    meters.integrated.store (outputMeter.getIntegrated());
    updatePeak (meters.outPeakL, L, n);
    updatePeak (meters.outPeakR, R, n);

    // --- write out (mono output gets mid)
    const int outCh = mainOut.getNumChannels();
    if (outCh >= 2)
    {
        mainOut.copyFrom (0, 0, work, 0, 0, n);
        mainOut.copyFrom (1, 0, work, 1, 0, n);
    }
    else if (outCh == 1)
    {
        float* o = mainOut.getWritePointer (0);
        for (int i = 0; i < n; ++i) o[i] = 0.5f * (L[i] + R[i]);
    }
}

//==============================================================================
void LeeMeetIIProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (auto xml = apvts.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void LeeMeetIIProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (apvts.state.getType()))
            apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessorEditor* LeeMeetIIProcessor::createEditor()
{
    return new LeeMeetIIEditor (*this);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new LeeMeetIIProcessor();
}
