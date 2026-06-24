import { supabase } from "./lib/supabase";

export default async function Home() {
  const { data, error } = await supabase
    .from("stocks")
    .select("*");

  return (
    <main style={{ padding: "20px" }}>
      <h1>台股歷史價格查詢器</h1>

      <h2>Supabase 測試結果</h2>

      {error ? (
        <pre>{JSON.stringify(error, null, 2)}</pre>
      ) : (
        <pre>{JSON.stringify(data, null, 2)}</pre>
      )}
    </main>
  );
}