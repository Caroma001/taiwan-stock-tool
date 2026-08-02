export type DecisionInput = {
    aiScore: number | null;
    trendScore?: number | null;
    volumeScore?: number | null;
    foreignScore?: number | null;
  };
  
  export type DecisionResult = {
    level: "BUY" | "HOLD" | "WAIT" | "RISK";
    title: string;
    color: string;
    action: string;
    position: number;
    confidence: number;
  };
  
  export function makeDecision(
    input: DecisionInput
  ): DecisionResult {
    const score = input.aiScore ?? 0;
  
    if (score >= 90) {
      return {
        level: "BUY",
        title: "積極布局",
        color: "#16a34a",
        action: "可考慮建立 40% 部位",
        position: 40,
        confidence: score,
      };
    }
  
    if (score >= 80) {
      return {
        level: "BUY",
        title: "買入觀察",
        color: "#22c55e",
        action: "建議建立 20% 部位",
        position: 20,
        confidence: score,
      };
    }
  
    if (score >= 65) {
      return {
        level: "HOLD",
        title: "持有續抱",
        color: "#3b82f6",
        action: "維持目前持股",
        position: 0,
        confidence: score,
      };
    }
  
    if (score >= 50) {
      return {
        level: "WAIT",
        title: "觀望等待",
        color: "#f59e0b",
        action: "等待更佳進場點",
        position: 0,
        confidence: score,
      };
    }
  
    return {
      level: "RISK",
      title: "風險偏高",
      color: "#ef4444",
      action: "暫時避免介入",
      position: 0,
      confidence: score,
    };
  }