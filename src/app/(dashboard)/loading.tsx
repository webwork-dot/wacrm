export default function DashboardLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
        aria-label="Loading"
      />
    </div>
  );
}
