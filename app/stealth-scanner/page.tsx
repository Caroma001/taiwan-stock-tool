import { redirect } from "next/navigation";

// M8.11.3: legacy 潛伏雷達 UI removed.  Swing10 is the only active decision UI.
export default function LegacyStealthScannerRedirect() {
  redirect("/swing10");
}
