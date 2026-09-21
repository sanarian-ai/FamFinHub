import { redirect } from "next/navigation";

// Portfolio hub: US Stocks is the first (and currently only) tab.
export default function PortfolioIndex() {
  redirect("/portfolio/us");
}
