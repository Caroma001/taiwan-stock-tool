import type { PriceProvider } from "@/providers/types";
import { MockPriceProvider } from "@/providers/MockPriceProvider";
import { FinMindPriceProvider } from "@/providers/FinMindPriceProvider";

export type ProviderName =
  | "mock"
  | "finmind";

export function getPriceProvider(
  providerName: ProviderName = "mock"
): PriceProvider {

  switch (providerName) {

    case "mock":
      return MockPriceProvider;

    case "finmind":
      return FinMindPriceProvider;

    default:
      throw new Error(`未知的 Provider：${providerName}`);
  }
}