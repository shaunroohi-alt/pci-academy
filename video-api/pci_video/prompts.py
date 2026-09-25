"""PCI Academy prompt templating.

Concepts follow the seven chapters of the app's programme
(app/src/state/programme.ts) plus a couple of general-purpose ones. The
house style mirrors the app itself: quiet, editorial, warm neutrals with an
amber accent, nothing loud.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

HOUSE_STYLE = (
    "Cinematic, calm and editorial. Soft natural window light, warm neutral palette "
    "of off-white, stone and charcoal with a restrained amber accent. Shallow depth of "
    "field, subtle film grain, slow deliberate camera movement, uncluttered composition, "
    "realistic textures, unhurried pacing."
)

NEGATIVE_BASE = (
    "text, captions, subtitles, watermark, logo, signature, low quality, blurry, "
    "worst quality, jpeg artifacts, distorted faces, deformed hands, extra fingers, "
    "flicker, jittery motion, morphing, oversaturated, neon, cartoon, cluttered frame"
)


@dataclass(frozen=True)
class Concept:
    key: str
    label: str
    chapter: str | None
    theme: str
    visuals: str
    camera: str

    def as_dict(self) -> dict:
        return asdict(self)


CONCEPTS: dict[str, Concept] = {c.key: c for c in [
    Concept("arrival", "Arrival", "I",
            "Where the day goes, and what you would like back.",
            "early morning light across a kitchen table, a notebook and a cup of coffee, a person pausing before the day begins",
            "slow push-in at eye level"),
    Concept("attention", "Attention", "II",
            "Looking until you see. The unhurried minute, the unnamed room.",
            "close details noticed slowly: dust in a sunbeam, the grain of wood, a hand resting on a windowsill, an empty quiet room",
            "static locked-off frame with a very gentle rack focus"),
    Concept("expression", "Expression", "III",
            "Saying the true thing plainly, on paper first.",
            "a pen moving across paper in a journal, ink catching the light, a person writing thoughtfully at a desk",
            "overhead top-down shot slowly drifting sideways"),
    Concept("judgement", "Judgement", "IV",
            "Deciding with less noise and fewer witnesses.",
            "a person standing alone at a quiet crossroads or doorway, weighing a choice, mist softening the background",
            "slow dolly-out revealing negative space"),
    Concept("conversation", "Conversation", "V",
            "The pause, the question, the second question.",
            "two people talking across a small table in a warm cafe, listening closely, a natural pause between them",
            "slow orbit around the table at shoulder height"),
    Concept("rest", "Rest", "VI",
            "Stopping as a skill rather than a collapse.",
            "late afternoon light on a linen sofa, a closed book, curtains moving in a light breeze, a person breathing slowly",
            "static wide shot, almost still"),
    Concept("integration", "Integration", "VII",
            "The practice without the app.",
            "a person walking through a city at golden hour, calm and present, putting the phone away into a pocket",
            "smooth tracking shot alongside the subject"),
    Concept("practice", "Daily practice", None,
            "The sixty-second daily practice.",
            "a single person sitting upright with eyes closed, a small timer on the table, morning light",
            "slow push-in from medium to close-up"),
    Concept("brand", "PCI Academy brand", None,
            "Psycho Creative Intelligence Academy: daily personal growth.",
            "abstract warm light moving across textured paper and stone, an amber glow slowly spreading",
            "slow lateral slide"),
    Concept("general", "General", None,
            "No chapter framing; only the house style is applied.",
            "",
            ""),
]}


@dataclass(frozen=True)
class RenderedPrompt:
    positive: str
    negative: str


def render(concept_key: str, prompt: str, negative_prompt: str | None = None,
           raw: bool = False, style_hint: str | None = None) -> RenderedPrompt:
    """Wrap the user's prompt in PCI context.

    Video models (LTX especially) do best with a single descriptive paragraph
    that opens with the main action, then setting, then camera and look.
    """
    concept = CONCEPTS[concept_key]
    prompt = " ".join(prompt.split()).rstrip(".")
    negative = ", ".join(p for p in (negative_prompt, NEGATIVE_BASE) if p)
    if raw:
        return RenderedPrompt(prompt, negative_prompt or NEGATIVE_BASE)

    parts = [prompt + "."]
    if concept.visuals:
        parts.append(f"The scene evokes {concept.label.lower()}: {concept.visuals}.")
    if concept.camera:
        parts.append(f"Camera: {concept.camera}.")
    parts.append(HOUSE_STYLE)
    if style_hint:
        parts.append(style_hint)
    return RenderedPrompt(" ".join(parts), negative)
