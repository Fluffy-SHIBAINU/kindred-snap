export function StatBlock({ figure, label }: { figure: string | number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-outlier text-xl tabular-nums">{figure}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
