#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"
#include "LookAndFeel.h"

namespace lm2::ui
{
/** Rotary knob with a title above and the value box below. */
class Knob : public juce::Component
{
public:
    Knob (juce::AudioProcessorValueTreeState& apvts, const juce::String& paramId, const juce::String& title)
    {
        slider.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        slider.setTextBoxStyle (juce::Slider::TextBoxBelow, false, 74, 16);
        slider.setPopupDisplayEnabled (false, false, nullptr);
        addAndMakeVisible (slider);
        label.setText (title, juce::dontSendNotification);
        label.setJustificationType (juce::Justification::centred);
        label.setColour (juce::Label::textColourId, Palette::dimText);
        label.setFont (juce::FontOptions (11.0f, juce::Font::bold));
        addAndMakeVisible (label);
        attachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (apvts, paramId, slider);
    }

    void resized() override
    {
        auto r = getLocalBounds();
        label.setBounds (r.removeFromTop (14));
        slider.setBounds (r);
    }

    juce::Slider slider;
private:
    juce::Label label;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> attachment;
};

/** Vertical bar meter, dB scaled, with peak-hold. */
class BarMeter : public juce::Component
{
public:
    BarMeter (float minDb, float maxDb, bool gainReduction = false) : lo (minDb), hi (maxDb), gr (gainReduction) {}
    void setValueDb (float db)
    {
        value = juce::jlimit (lo, hi, db);
        if (gr) { hold = juce::jmin (hold, value); holdAge = 0; }
        else    { if (value >= hold) { hold = value; holdAge = 0; } }
        if (++holdAge > 40) hold = gr ? juce::jmax (hold + 0.5f, value) : juce::jmax (hold - 0.5f, value);
        repaint();
    }
    void paint (juce::Graphics& g) override
    {
        auto r = getLocalBounds().toFloat();
        g.setColour (Palette::track);
        g.fillRoundedRectangle (r, 2.0f);
        const float frac = (value - lo) / (hi - lo);
        if (gr)
        {
            // gain reduction grows downward from the top
            const float h = r.getHeight() * (1.0f - frac);
            g.setColour (Palette::accent);
            g.fillRoundedRectangle (r.withHeight (h), 2.0f);
        }
        else
        {
            const float h = r.getHeight() * frac;
            auto bar = r.withTop (r.getBottom() - h);
            juce::ColourGradient grad (Palette::meterGreen, 0, r.getBottom(), Palette::meterRed, 0, r.getY(), false);
            grad.addColour (0.75, Palette::accent);
            g.setGradientFill (grad);
            g.fillRoundedRectangle (bar, 2.0f);
            const float hy = r.getBottom() - r.getHeight() * ((hold - lo) / (hi - lo));
            g.setColour (Palette::text);
            g.fillRect (r.getX(), hy - 1.0f, r.getWidth(), 2.0f);
        }
    }
private:
    float lo, hi, value = -120.0f, hold = -120.0f;
    bool gr; int holdAge = 0;
};

class Section : public juce::Component
{
public:
    explicit Section (const juce::String& title) : name (title) {}
    void paint (juce::Graphics& g) override
    {
        auto r = getLocalBounds().toFloat();
        g.setColour (Palette::panel);
        g.fillRoundedRectangle (r, 8.0f);
        g.setColour (Palette::panelEdge);
        g.drawRoundedRectangle (r.reduced (0.5f), 8.0f, 1.0f);
        g.setColour (Palette::accent);
        g.setFont (juce::FontOptions (12.0f, juce::Font::bold));
        g.drawText (name, getLocalBounds().removeFromTop (22).reduced (10, 0), juce::Justification::centredLeft);
        g.setColour (Palette::panelEdge);
        g.fillRect (8, 22, getWidth() - 16, 1);
    }
    juce::Rectangle<int> content() const { return getLocalBounds().withTrimmedTop (26).reduced (8, 6); }
private:
    juce::String name;
};
} // namespace lm2::ui

class LeeMeetIIEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit LeeMeetIIEditor (LeeMeetIIProcessor&);
    ~LeeMeetIIEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    static juce::String lufsText (float v);

    LeeMeetIIProcessor& processor;
    lm2::LeeMeetLookAndFeel lnf;

    using Knob = lm2::ui::Knob;
    using Section = lm2::ui::Section;
    using BarMeter = lm2::ui::BarMeter;
    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;
    using ComboAttachment = juce::AudioProcessorValueTreeState::ComboBoxAttachment;

    Section inputSection { "INPUT" }, fatSection { "FATNESS" }, msSection { "MID / SIDE" },
            compSection { "PARALLEL COMPRESSION" }, lufsSection { "LUFS CONTROL" },
            limSection { "MASTER LIMITER" }, outSection { "OUTPUT" };

    Knob inputGain, sensitivity, fatness, width, presenceFreq, midPresence, sidePresence,
         compThreshold, compRatio, compAttack, compRelease, compMakeup, compMix, scHpf,
         lufsTarget, ceiling, limRelease;

    juce::ComboBox scSource;
    juce::ToggleButton scListen { "LISTEN" }, lufsAuto { "AUTO" }, limEnabled { "ON" }, bypass { "BYPASS" };
    juce::TextButton resetMeters { "RESET" };
    std::unique_ptr<ComboAttachment> scSourceAtt;
    std::unique_ptr<ButtonAttachment> scListenAtt, lufsAutoAtt, limEnabledAtt, bypassAtt;

    BarMeter inL { -60.0f, 0.0f }, inR { -60.0f, 0.0f }, outL { -60.0f, 0.0f }, outR { -60.0f, 0.0f },
             compGr { -20.0f, 0.0f, true }, limGr { -20.0f, 0.0f, true };
    juce::Label momentaryLabel, shortTermLabel, integratedLabel, autoGainLabel, outPeakLabel,
                compGrLabel, limGrLabel, inLabel, outLabel;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (LeeMeetIIEditor)
};
