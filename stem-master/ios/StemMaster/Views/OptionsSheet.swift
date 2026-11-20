import SwiftUI

/// Options sheet shown after import (and for retries with different options).
@MainActor
struct OptionsSheet: View {
    let request: OptionsRequest

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var options: JobOptions

    init(request: OptionsRequest) {
        self.request = request
        _options = State(initialValue: request.options)
    }

    private var session: SessionRecord? { model.store.session(id: request.id) }

    var body: some View {
        NavigationStack {
            Form {
                if let session {
                    Section {
                        HStack(spacing: 12) {
                            Image(systemName: "waveform")
                                .font(.title2)
                                .foregroundStyle(Color.smAccent)
                                .frame(width: 36)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(session.title)
                                    .font(.headline)
                                    .foregroundStyle(Color.smInk)
                                    .lineLimit(2)
                                Text("\(session.originalFilename) · \(NumberFormatting.bytes(session.sourceBytes))")
                                    .font(.caption)
                                    .foregroundStyle(Color.smMuted)
                                    .lineLimit(1)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                    .listRowBackground(Color.smPanel)
                }
                OptionsFormSections(options: $options)
            }
            .scrollContentBackground(.hidden)
            .background(Color.smBackground)
            .navigationTitle("Separation Options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Later") {
                        dismiss()
                    }
                    .accessibilityHint("Keeps the track in your library without starting")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Defaults") {
                        Haptics.selection()
                        options = model.settings.defaultOptions
                    }
                    .accessibilityHint("Resets the options to your defaults from Settings")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button {
                    Haptics.success()
                    model.confirmOptions(options, for: request.id)
                } label: {
                    Label("Separate Stems", systemImage: "wand.and.stars")
                }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.horizontal, Theme.gutter)
                .padding(.top, 10)
                .padding(.bottom, 8)
                .background(.ultraThinMaterial)
                .disabled(session == nil)
            }
        }
        .presentationDragIndicator(.visible)
        .tint(Color.smAccent)
    }
}

/// The option controls, shared by the options sheet and Settings > Default Options.
@MainActor
struct OptionsFormSections: View {
    @Binding var options: JobOptions

    var body: some View {
        Section {
            Picker("Quality", selection: $options.quality) {
                ForEach(Quality.allCases, id: \.self) { quality in
                    Text(quality.title).tag(quality)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityLabel("Quality")
        } header: {
            Text("Quality")
        } footer: {
            Text(options.quality.explanation)
        }
        .listRowBackground(Color.smPanel)

        Section {
            OptionToggle(
                title: "Lead / backing vocals",
                detail: OptionText.vocalSplit,
                systemImage: "person.2.wave.2",
                isOn: $options.vocalSplit
            )
            OptionToggle(
                title: "Dry vocals (de-reverb)",
                detail: OptionText.dereverb,
                systemImage: "drop.halffull",
                isOn: $options.dereverb
            )
        } header: {
            Text("Vocals")
        } footer: {
            Text(OptionText.vocalFocus)
        }
        .listRowBackground(Color.smPanel)

        Section {
            OptionToggle(
                title: "Drum split",
                detail: OptionText.drumSplit,
                systemImage: "metronome.fill",
                isOn: $options.drumSplit
            )
        } header: {
            Text("Drums")
        }
        .listRowBackground(Color.smPanel)

        Section {
            OptionToggle(
                title: "Cleanup",
                detail: OptionText.cleanup,
                systemImage: "sparkles",
                isOn: $options.cleanup
            )
            if options.cleanup {
                StrengthPicker(title: "Cleanup strength", selection: $options.cleanupStrength)
                Text(OptionText.cleanupStrength(options.cleanupStrength))
                    .font(.caption)
                    .foregroundStyle(Color.smMuted)
            }
        } header: {
            Text("Cleanup")
        }
        .listRowBackground(Color.smPanel)

        Section {
            OptionToggle(
                title: "Denoise",
                detail: OptionText.denoise,
                systemImage: "waveform.path.badge.minus",
                isOn: $options.denoise
            )
            if options.denoise {
                StrengthPicker(title: "Denoise strength", selection: $options.denoiseStrength)
                Text(OptionText.denoiseStrength(options.denoiseStrength))
                    .font(.caption)
                    .foregroundStyle(Color.smMuted)
            }
        } header: {
            Text("Denoise")
        }
        .listRowBackground(Color.smPanel)

        Section {
            Picker("Format", selection: $options.outputFormat) {
                ForEach(OutputFormat.allCases, id: \.self) { format in
                    Text(format.title).tag(format)
                }
            }
            .pickerStyle(.menu)
        } header: {
            Text("Lossless output")
        } footer: {
            Text(options.outputFormat.explanation)
        }
        .listRowBackground(Color.smPanel)
    }
}

/// Toggle with an icon and a one-line explanation.
struct OptionToggle: View {
    let title: String
    let detail: String
    let systemImage: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: systemImage)
                    .foregroundStyle(isOn ? Color.smAccent : Color.smMuted)
                    .frame(width: 24)
                    .padding(.top, 2)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.smInk)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Color.smMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Color.smAccent)
        .onChange(of: isOn) { _, _ in
            Haptics.selection()
        }
    }
}

/// Light / Standard / Strong segmented picker.
struct StrengthPicker: View {
    let title: String
    @Binding var selection: Strength

    var body: some View {
        Picker(title, selection: $selection) {
            ForEach(Strength.allCases, id: \.self) { strength in
                Text(strength.title).tag(strength)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityLabel(title)
    }
}
