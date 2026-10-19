#pragma once
#include <juce_gui_basics/juce_gui_basics.h>

namespace lm2
{
struct Palette
{
    static inline const juce::Colour background { 0xff15171a };
    static inline const juce::Colour panel      { 0xff1e2126 };
    static inline const juce::Colour panelEdge  { 0xff2c3038 };
    static inline const juce::Colour text       { 0xffe6e1d6 };
    static inline const juce::Colour dimText    { 0xff8d9099 };
    static inline const juce::Colour accent     { 0xfff2b544 };   // MP Audio amber
    static inline const juce::Colour accentDark { 0xffb57d1b };
    static inline const juce::Colour meterGreen { 0xff5fcf7f };
    static inline const juce::Colour meterRed   { 0xffe85d4a };
    static inline const juce::Colour track      { 0xff33373f };
};

class LeeMeetLookAndFeel : public juce::LookAndFeel_V4
{
public:
    LeeMeetLookAndFeel()
    {
        setColour (juce::Slider::textBoxTextColourId, Palette::text);
        setColour (juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
        setColour (juce::Slider::textBoxBackgroundColourId, juce::Colours::transparentBlack);
        setColour (juce::Label::textColourId, Palette::text);
        setColour (juce::ComboBox::backgroundColourId, Palette::track);
        setColour (juce::ComboBox::textColourId, Palette::text);
        setColour (juce::ComboBox::outlineColourId, Palette::panelEdge);
        setColour (juce::ComboBox::arrowColourId, Palette::accent);
        setColour (juce::PopupMenu::backgroundColourId, Palette::panel);
        setColour (juce::PopupMenu::textColourId, Palette::text);
        setColour (juce::PopupMenu::highlightedBackgroundColourId, Palette::accentDark);
        setColour (juce::ToggleButton::textColourId, Palette::text);
        setColour (juce::ToggleButton::tickColourId, Palette::accent);
    }

    void drawRotarySlider (juce::Graphics& g, int x, int y, int width, int height, float sliderPos,
                           float rotaryStartAngle, float rotaryEndAngle, juce::Slider& slider) override
    {
        auto bounds = juce::Rectangle<float> ((float) x, (float) y, (float) width, (float) height).reduced (4.0f);
        const float size = juce::jmin (bounds.getWidth(), bounds.getHeight());
        bounds = bounds.withSizeKeepingCentre (size, size);
        const auto centre = bounds.getCentre();
        const float radius = size * 0.5f;
        const float arcRadius = radius - 3.0f;
        const float lineW = juce::jmax (2.0f, radius * 0.11f);
        const float angle = rotaryStartAngle + sliderPos * (rotaryEndAngle - rotaryStartAngle);

        // body
        g.setColour (Palette::track.darker (0.3f));
        g.fillEllipse (bounds.reduced (lineW * 1.8f));
        g.setColour (Palette::panelEdge);
        g.drawEllipse (bounds.reduced (lineW * 1.8f), 1.0f);

        // background arc
        juce::Path bg;
        bg.addCentredArc (centre.x, centre.y, arcRadius, arcRadius, 0.0f, rotaryStartAngle, rotaryEndAngle, true);
        g.setColour (Palette::track);
        g.strokePath (bg, juce::PathStrokeType (lineW, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

        // value arc (bipolar sliders fill from centre)
        const bool bipolar = slider.getMinimum() < 0.0 && slider.getMaximum() > 0.0;
        const float zeroPos = bipolar ? (float) ((0.0 - slider.getMinimum()) / (slider.getMaximum() - slider.getMinimum())) : 0.0f;
        const float zeroAngle = rotaryStartAngle + zeroPos * (rotaryEndAngle - rotaryStartAngle);
        juce::Path val;
        val.addCentredArc (centre.x, centre.y, arcRadius, arcRadius, 0.0f,
                           juce::jmin (zeroAngle, angle), juce::jmax (zeroAngle, angle), true);
        g.setColour (slider.isEnabled() ? Palette::accent : Palette::dimText);
        g.strokePath (val, juce::PathStrokeType (lineW, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

        // pointer
        juce::Path p;
        const float pointerLen = radius * 0.42f;
        p.addRoundedRectangle (-lineW * 0.5f, -radius + lineW * 2.4f, lineW, pointerLen, lineW * 0.5f);
        p.applyTransform (juce::AffineTransform::rotation (angle).translated (centre));
        g.setColour (Palette::text);
        g.fillPath (p);
    }

    void drawToggleButton (juce::Graphics& g, juce::ToggleButton& b, bool highlighted, bool down) override
    {
        juce::ignoreUnused (down);
        auto r = b.getLocalBounds().toFloat().reduced (1.0f);
        const bool on = b.getToggleState();
        g.setColour (on ? Palette::accent : Palette::track);
        g.fillRoundedRectangle (r, 4.0f);
        if (highlighted) { g.setColour (juce::Colours::white.withAlpha (0.08f)); g.fillRoundedRectangle (r, 4.0f); }
        g.setColour (on ? Palette::background : Palette::text);
        g.setFont (juce::FontOptions (12.0f, juce::Font::bold));
        g.drawText (b.getButtonText(), r, juce::Justification::centred);
    }

    juce::Font getLabelFont (juce::Label&) override { return juce::Font (juce::FontOptions (12.0f)); }
    juce::Font getComboBoxFont (juce::ComboBox&) override { return juce::Font (juce::FontOptions (12.0f)); }
    juce::Font getPopupMenuFont() override { return juce::Font (juce::FontOptions (13.0f)); }
};
} // namespace lm2
