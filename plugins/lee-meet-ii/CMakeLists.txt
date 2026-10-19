cmake_minimum_required(VERSION 3.22)

# Universal binary on macOS (Apple silicon + Intel), set before project().
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "")
set(CMAKE_OSX_DEPLOYMENT_TARGET "10.13" CACHE STRING "")

project(LeeMeetII VERSION 2.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set_property(GLOBAL PROPERTY USE_FOLDERS ON)

option(LM2_BUILD_TESTS "Build the DSP test executable" ON)

# ---------------------------------------------------------------------------
# JUCE: pinned release, fetched at configure time.
# Set -DFETCHCONTENT_SOURCE_DIR_JUCE=/path/to/JUCE to use a local checkout.
# ---------------------------------------------------------------------------
include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        8.0.4
    GIT_SHALLOW    TRUE
    GIT_PROGRESS   TRUE)
FetchContent_MakeAvailable(JUCE)

# ---------------------------------------------------------------------------
# Plugin
# ---------------------------------------------------------------------------
juce_add_plugin(LeeMeetII
    PRODUCT_NAME                "Lee-Meet II"
    COMPANY_NAME                "MP Audio"
    COMPANY_WEBSITE             "https://mpaudio.example"
    BUNDLE_ID                   "com.mpaudio.leemeetii"
    PLUGIN_MANUFACTURER_CODE    MPau
    PLUGIN_CODE                 Lmt2
    FORMATS                     AU VST3 Standalone
    VST3_CATEGORIES             Fx Mastering Dynamics
    AU_MAIN_TYPE                kAudioUnitType_Effect
    IS_SYNTH                    FALSE
    NEEDS_MIDI_INPUT            FALSE
    NEEDS_MIDI_OUTPUT           FALSE
    IS_MIDI_EFFECT              FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD     FALSE
    HARDENED_RUNTIME_ENABLED    TRUE
    DESCRIPTION                 "Mastering limiter / maximizer with LUFS control, fatness, width, parallel compression and mid/side presence")

target_sources(LeeMeetII PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp)

target_include_directories(LeeMeetII PRIVATE Source)

target_compile_definitions(LeeMeetII PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_MODAL_LOOPS_PERMITTED=0)

target_link_libraries(LeeMeetII
    PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)

# ---------------------------------------------------------------------------
# DSP tests: a console app that drives the processor offline.
# ---------------------------------------------------------------------------
if(LM2_BUILD_TESTS)
    juce_add_console_app(LeeMeetIITests PRODUCT_NAME "LeeMeetIITests")
    target_sources(LeeMeetIITests PRIVATE Tests/DspTests.cpp)
    target_include_directories(LeeMeetIITests PRIVATE Source)
    target_compile_definitions(LeeMeetIITests PRIVATE
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_MODAL_LOOPS_PERMITTED=0
        JucePlugin_Name="Lee-Meet II")
    target_link_libraries(LeeMeetIITests PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)
    enable_testing()
    add_test(NAME LeeMeetIITests COMMAND LeeMeetIITests)
endif()
