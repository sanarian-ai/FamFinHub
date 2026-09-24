import { redirect } from "next/navigation";

// Portfolio hub: All assets is the landing tab — see PortfolioSwitcher and portfolio/all/page.tsx.
export default function PortfolioIndex() {
  redirect("/portfolio/all");
}
