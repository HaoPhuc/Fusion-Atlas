import type { SeenStatus } from "@/lib/seen";

export function SeenBadge({
  status,
  newGroup,
}: {
  status: SeenStatus;
  newGroup?: boolean;
}) {
  const title =
    status.kind === "seen"
      ? `First seen ${new Date(status.firstSeenAt).toLocaleDateString()}`
      : status.kind === "acted"
        ? "Feedback, a shortlist entry or an official-page check is recorded."
        : "No matching person in the search history at the start of this run.";
  return (
    <>
      <span className="seen-badge" title={title}>
        {status.kind === "new"
          ? "New"
          : status.kind === "acted"
            ? "Acted"
            : "Seen"}
      </span>
      {newGroup && (
        <span
          className="seen-badge"
          title="This group was absent from the history at the start of this run."
        >
          New group
        </span>
      )}
    </>
  );
}
