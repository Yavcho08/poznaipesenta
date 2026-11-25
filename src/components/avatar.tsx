// Аватар: снимка от Google (URL) или избрано емоджи ("emoji:🎤"). Без избор — първата буква.

export const AVATAR_EMOJIS = ["🎤", "🎧", "💃", "🕺", "🎷", "🥁", "🎸", "🎹", "🪩", "🔥", "👑", "💎", "🌹", "🦄", "🐯", "🍒"] as const;

export function avatarEmoji(value: string | null | undefined): string | null {
  return value?.startsWith("emoji:") ? value.slice("emoji:".length) : null;
}

export function Avatar({
  value,
  name,
  size = 32,
  className = "",
}: {
  value: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const emoji = avatarEmoji(value);
  const style = { width: size, height: size, fontSize: size * 0.55 };
  const base = `grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-accent/40 to-accent-2/40 ${className}`;
  if (value && !emoji) {
    // eslint-disable-next-line @next/next/no-img-element -- външен URL от Google, без оптимизация
    return <img src={value} alt="" width={size} height={size} referrerPolicy="no-referrer" className={`${base} object-cover`} style={style} />;
  }
  return (
    <span className={base} style={style} aria-hidden>
      {emoji ?? (name?.trim()[0]?.toUpperCase() || "♪")}
    </span>
  );
}
