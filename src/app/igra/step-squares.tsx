import { STEPS, type RoundView } from "@/lib/game/rules";

/** Пет квадратчета за стъпките: зелено = познато, червено = грешно, сиво = пропуснато. */
export function StepSquares({ round, size = "md" }: { round: RoundView; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-3 w-3" : "h-4 flex-1";
  return (
    <div className={`flex gap-1 ${size === "sm" ? "" : "w-full"}`} aria-label="Опити по стъпки">
      {STEPS.map((_, step) => {
        const guess = round.guesses.find((g) => g.step === step);
        let color = "bg-white/10";
        if (guess?.kind === "skip") color = "bg-white/35";
        else if (guess?.kind === "guess") color = guess.correct ? "bg-green-500" : "bg-red-500";
        else if (!round.done && step === round.step) color = "bg-white/10 ring-1 ring-accent";
        return <span key={step} className={`${box} rounded-sm ${color}`} />;
      })}
    </div>
  );
}
