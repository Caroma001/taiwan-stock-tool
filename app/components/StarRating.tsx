export default function StarRating({ value }: { value?: number | null }) {
    const rating = Math.max(0, Math.min(5, Number(value ?? 0)));
  
    return (
      <span style={wrapStyle} title={`${rating} 星`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            style={{
              ...starStyle,
              color: i < rating ? "#facc15" : "#3f3f46",
              textShadow:
                i < rating
                  ? "0 0 8px rgba(250,204,21,0.55)"
                  : "none",
            }}
          >
            ★
          </span>
        ))}
      </span>
    );
  }
  
  const wrapStyle: React.CSSProperties = {
    display: "inline-flex",
    gap: 2,
    alignItems: "center",
    whiteSpace: "nowrap",
  };
  
  const starStyle: React.CSSProperties = {
    fontSize: 18,
    lineHeight: 1,
  };