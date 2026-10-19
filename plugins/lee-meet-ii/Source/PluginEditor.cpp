#include "PluginEditor.h"

using namespace lm2;

LeeMeetIIEditor::LeeMeetIIEditor (LeeMeetIIProcessor& p)
    : AudioProcessorEditor (&p), processor (p),
      inputGain     (p.apvts, id::inputGain,     "INPUT GAIN"),
      sensitivity   (p.apvts, id::sensitivity,   "SENSITIVITY"),
      fatness       (p.apvts, id::fatness,       "FATNESS"),
      width         (p.apvts, id::width,         "WIDTH"),
      presenceFreq  (p.apvts, id::presenceFreq,  "PRES FREQ"),
      midPresence   (p.apvts, id::midPresence,   "MID"),
      sidePresence  (p.apvts, id::sidePresence,  "SIDE"),
      compThreshold (p.apvts, id::compThreshold, "THRESHOLD"),
      compRatio     (p.apvts, id::compRatio,     "RATIO"),
      compAttack    (p.apvts, id::compAttack,    "ATTACK"),
      compRelease   (p.apvts, id::compRelease,   "RELEASE"),
      compMakeup    (p.apvts, id::compMakeup,    "MAKEUP"),
      compMix       (p.apvts, id::compMix,       "MIX"),
      scHpf         (p.apvts, id::scHpf,         "SC HPF"),
      lufsTarget    (p.apvts, id::lufsTarget,    "TARGET"),
      ceiling       (p.apvts, id::ceiling,       "CEILING"),
      limRelease    (p.apvts, id::limRelease,    "RELEASE")
{
    setLookAndFeel (&lnf);

    for (auto* s : { &inputSection, &fatSection, &msSection, &compSection, &lufsSection, &limSection, &outSection })
        addAndMakeVisible (s);

    auto add = [] (juce::Component& parent, std::initializer_list<juce::Component*> comps)
    { for (auto* c : comps) parent.addAndMakeVisible (c); };

    add (inputSection, { &inputGain, &sensitivity, &inL, &inR, &inLabel });
    add (fatSection,   { &fatness });
    add (msSection,    { &width, &presenceFreq, &midPresence, &sidePresence });
    add (compSection,  { &compThreshold, &compRatio, &compAttack, &compRelease, &compMakeup, &compMix, &scHpf,
                         &scSource, &scListen, &compGr, &compGrLabel });
    add (lufsSection,  { &lufsTarget, &lufsAuto, &momentaryLabel, &shortTermLabel, &integratedLabel, &autoGainLabel, &resetMeters });
    add (limSection,   { &ceiling, &limRelease, &limEnabled, &limGr, &limGrLabel });
    add (outSection,   { &outL, &outR, &outPeakLabel, &outLabel });
    addAndMakeVisible (bypass);

    scSource.addItemList ({ "Internal", "External" }, 1);
    scSourceAtt   = std::make_unique<ComboAttachment> (p.apvts, id::scSource, scSource);
    scListenAtt   = std::make_unique<ButtonAttachment> (p.apvts, id::scListen, scListen);
    lufsAutoAtt   = std::make_unique<ButtonAttachment> (p.apvts, id::lufsAuto, lufsAuto);
    limEnabledAtt = std::make_unique<ButtonAttachment> (p.apvts, id::limEnabled, limEnabled);
    bypassAtt     = std::make_unique<ButtonAttachment> (p.apvts, id::bypass, bypass);

    resetMeters.setColour (juce::TextButton::buttonColourId, Palette::track);
    resetMeters.setColour (juce::TextButton::textColourOffId, Palette::text);
    resetMeters.onClick = [this] { processor.resetLoudnessMeters(); };

    for (auto* l : { &momentaryLabel, &shortTermLabel, &integratedLabel, &autoGainLabel, &outPeakLabel, &compGrLabel, &limGrLabel, &inLabel, &outLabel })
    {
        l->setJustificationType (juce::Justification::centred);
        l->setFont (juce::FontOptions (12.0f));
        l->setColour (juce::Label::textColourId, Palette::text);
    }
    integratedLabel.setFont (juce::FontOptions (20.0f, juce::Font::bold));
    integratedLabel.setColour (juce::Label::textColourId, Palette::accent);
    inLabel.setText ("IN", juce::dontSendNotification);
    outLabel.setText ("OUT dBTP", juce::dontSendNotification);
    inLabel.setColour (juce::Label::textColourId, Palette::dimText);
    outLabel.setColour (juce::Label::textColourId, Palette::dimText);
    compGrLabel.setColour (juce::Label::textColourId, Palette::dimText);
    limGrLabel.setColour (juce::Label::textColourId, Palette::dimText);

    setSize (1040, 600);
    startTimerHz (30);
}

LeeMeetIIEditor::~LeeMeetIIEditor()
{
    stopTimer();
    setLookAndFeel (nullptr);
}

void LeeMeetIIEditor::paint (juce::Graphics& g)
{
    g.fillAll (Palette::background);

    auto header = getLocalBounds().removeFromTop (64).reduced (18, 0);
    g.setColour (Palette::text);
    g.setFont (juce::FontOptions (28.0f, juce::Font::bold));
    g.drawText ("LEE-MEET II", header.removeFromLeft (260), juce::Justification::centredLeft);
    g.setColour (Palette::accent);
    g.setFont (juce::FontOptions (12.0f, juce::Font::bold));
    g.drawText ("MP AUDIO   |   MASTERING LIMITER / MAXIMIZER", header.withTrimmedLeft (4).withTrimmedTop (6),
                juce::Justification::centredLeft);
    g.setColour (Palette::panelEdge);
    g.fillRect (18, 62, getWidth() - 36, 1);
}

void LeeMeetIIEditor::resized()
{
    auto r = getLocalBounds();
    auto header = r.removeFromTop (64).reduced (18, 0);
    bypass.setBounds (header.removeFromRight (90).withSizeKeepingCentre (90, 26));

    r = r.reduced (12);
    const int gap = 8;

    // Top row: INPUT | FATNESS | MID/SIDE | LUFS
    auto top = r.removeFromTop ((r.getHeight() - gap) / 2);
    r.removeFromTop (gap);
    auto bottom = r;

    inputSection.setBounds (top.removeFromLeft (250)); top.removeFromLeft (gap);
    fatSection.setBounds (top.removeFromLeft (130));   top.removeFromLeft (gap);
    lufsSection.setBounds (top.removeFromRight (300)); top.removeFromRight (gap);
    msSection.setBounds (top);

    // Bottom row: PARALLEL COMP | LIMITER | OUTPUT
    outSection.setBounds (bottom.removeFromRight (150)); bottom.removeFromRight (gap);
    limSection.setBounds (bottom.removeFromRight (300)); bottom.removeFromRight (gap);
    compSection.setBounds (bottom);

    auto knobRow = [] (juce::Rectangle<int> area, std::initializer_list<juce::Component*> comps)
    {
        const int w = area.getWidth() / (int) comps.size();
        for (auto* c : comps) c->setBounds (area.removeFromLeft (w));
    };

    // INPUT
    {
        auto c = inputSection.content();
        auto meters = c.removeFromRight (44);
        inLabel.setBounds (meters.removeFromBottom (16));
        inL.setBounds (meters.removeFromLeft (18).reduced (0, 2));
        meters.removeFromLeft (4);
        inR.setBounds (meters.removeFromLeft (18).reduced (0, 2));
        knobRow (c, { &inputGain, &sensitivity });
    }
    // FATNESS
    fatness.setBounds (fatSection.content());
    // MID / SIDE
    knobRow (msSection.content(), { &width, &presenceFreq, &midPresence, &sidePresence });
    // LUFS
    {
        auto c = lufsSection.content();
        auto left = c.removeFromLeft (120);
        lufsAuto.setBounds (left.removeFromBottom (24).reduced (16, 0));
        lufsTarget.setBounds (left);
        auto readout = c.reduced (6, 0);
        auto row = readout.removeFromTop (22);
        resetMeters.setBounds (row.removeFromRight (56));
        integratedLabel.setBounds (readout.removeFromTop (34));
        auto small = readout.removeFromTop (18);
        momentaryLabel.setBounds (small.removeFromLeft (small.getWidth() / 2));
        shortTermLabel.setBounds (small);
        autoGainLabel.setBounds (readout.removeFromTop (18));
    }
    // COMP
    {
        auto c = compSection.content();
        auto grArea = c.removeFromRight (60);
        compGrLabel.setBounds (grArea.removeFromBottom (16));
        compGr.setBounds (grArea.withSizeKeepingCentre (18, grArea.getHeight() - 8));
        auto scRow = c.removeFromBottom (28);
        scSource.setBounds (scRow.removeFromLeft (120).reduced (4, 2));
        scListen.setBounds (scRow.removeFromLeft (80).reduced (4, 2));
        knobRow (c, { &compThreshold, &compRatio, &compAttack, &compRelease, &compMakeup, &compMix, &scHpf });
    }
    // LIMITER
    {
        auto c = limSection.content();
        auto grArea = c.removeFromRight (60);
        limGrLabel.setBounds (grArea.removeFromBottom (16));
        limGr.setBounds (grArea.withSizeKeepingCentre (18, grArea.getHeight() - 8));
        auto onRow = c.removeFromBottom (28);
        limEnabled.setBounds (onRow.withSizeKeepingCentre (70, 24));
        knobRow (c, { &ceiling, &limRelease });
    }
    // OUTPUT
    {
        auto c = outSection.content();
        outLabel.setBounds (c.removeFromBottom (16));
        outPeakLabel.setBounds (c.removeFromBottom (18));
        auto m = c.withSizeKeepingCentre (44, c.getHeight() - 8);
        outL.setBounds (m.removeFromLeft (18));
        m.removeFromLeft (8);
        outR.setBounds (m.removeFromLeft (18));
    }
}

juce::String LeeMeetIIEditor::lufsText (float v)
{
    return v <= -100.0f ? juce::String ("-inf") : juce::String (v, 1);
}

void LeeMeetIIEditor::timerCallback()
{
    auto& m = processor.meters;
    auto toDb = [] (std::atomic<float>& a) { return juce::Decibels::gainToDecibels (a.exchange (0.0f), -120.0f); };

    inL.setValueDb (toDb (m.inPeakL));
    inR.setValueDb (toDb (m.inPeakR));
    const float oL = toDb (m.outPeakL), oR = toDb (m.outPeakR);
    outL.setValueDb (oL);
    outR.setValueDb (oR);
    outPeakLabel.setText (juce::String (juce::jmax (oL, oR), 1) + " dB", juce::dontSendNotification);

    const float cgr = m.compGrDb.load(), lgr = m.limGrDb.load();
    compGr.setValueDb (cgr);
    limGr.setValueDb (lgr);
    compGrLabel.setText (juce::String (cgr, 1) + " dB", juce::dontSendNotification);
    limGrLabel.setText (juce::String (lgr, 1) + " dB", juce::dontSendNotification);

    integratedLabel.setText (lufsText (m.integrated.load()) + " LUFS", juce::dontSendNotification);
    momentaryLabel.setText ("M " + lufsText (m.momentary.load()), juce::dontSendNotification);
    shortTermLabel.setText ("S " + lufsText (m.shortTerm.load()), juce::dontSendNotification);
    const float ag = m.autoGainDb.load();
    autoGainLabel.setText ("Auto gain " + juce::String (ag >= 0 ? "+" : "") + juce::String (ag, 1) + " dB", juce::dontSendNotification);
}
