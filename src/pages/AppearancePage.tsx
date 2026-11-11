import { Palette, Type } from "lucide-react";
import { AccentColor, AppearanceMode, FontStyle, useAppearance } from "../lib/appearance";
import { Card, CardHead, PageHead, Segmented } from "../components/ui";

const MODE_DETAILS: Record<AppearanceMode, string> = {
  light: "A bright workspace with dark text.",
  dark: "A darker workspace that is easier on the eyes in low light.",
  system: "Automatically follows your device's light or dark setting.",
  custom: "Choose a color accent to make SupportIQ feel more like yours.",
};

const ACCENT_OPTIONS: { value: AccentColor; label: string; color: string }[] = [
  { value: "evergreen", label: "Evergreen", color: "#0f765d" },
  { value: "ocean", label: "Ocean", color: "#286a9c" },
  { value: "berry", label: "Berry", color: "#984d6b" },
  { value: "gold", label: "Gold", color: "#9b6811" },
];

const FONT_OPTIONS: { value: FontStyle; label: string; description: string; family: string }[] = [
  { value: "soft", label: "Soft", description: "Nunito Sans with Lora headings", family: '"Nunito Sans Variable", sans-serif' },
  { value: "clear", label: "Clear", description: "DM Sans with Lora headings", family: '"DM Sans Variable", sans-serif' },
];

export default function AppearancePage() {
  const { mode, accent, font, setMode, setAccent, setFont } = useAppearance();

  return (
    <>
      <PageHead
        eyebrow="Preferences"
        title="Appearance"
        description="Make SupportIQ comfortable to read. Your choices are saved on this device."
      />

      <div className="appearance-layout">
        <Card>
          <CardHead title="Color mode" description="Choose a light or dark workspace, or follow your device." />
          <div className="card-body">
            <Segmented
              ariaLabel="Color mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
                { value: "custom", label: "Custom" },
              ]}
            />
            <p className="appearance-hint">{MODE_DETAILS[mode]}</p>

            {mode === "custom" ? (
              <div className="appearance-section">
                <h3 className="appearance-label"><Palette size={15} /> Accent color</h3>
                <div className="accent-options" role="radiogroup" aria-label="Custom accent color">
                  {ACCENT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`accent-option ${accent === option.value ? "is-selected" : ""}`.trim()}
                      role="radio"
                      aria-checked={accent === option.value}
                      onClick={() => setAccent(option.value)}
                    >
                      <span className="accent-swatch" style={{ background: option.color }} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHead title="Reading style" description="Choose the letterforms that feel most comfortable to you." />
          <div className="card-body">
            <div className="font-options" role="radiogroup" aria-label="Font style">
              {FONT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`font-option ${font === option.value ? "is-selected" : ""}`.trim()}
                  role="radio"
                  aria-checked={font === option.value}
                  onClick={() => setFont(option.value)}
                >
                  <span className="font-option-heading">
                    <Type size={15} />
                    {option.label}
                  </span>
                  <span className="font-option-sample" style={{ fontFamily: option.family }}>Aa Bb 123</span>
                  <span className="font-option-description">{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Preview" description="A quick look at your selected appearance." />
          <div className="card-body appearance-preview">
            <div className="appearance-preview-copy">
              <span className="appearance-preview-kicker">Support request</span>
              <h2>Can't access my account</h2>
              <p>Your chosen font and colors apply throughout the customer, agent, and admin workspaces.</p>
            </div>
            <span className="appearance-preview-swatch" aria-hidden="true" />
          </div>
        </Card>
      </div>
    </>
  );
}