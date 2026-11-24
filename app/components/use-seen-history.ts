import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSeenHistory,
  recordSeen,
  seenStorageKey,
  type SeenLedger,
} from "@/lib/seen";

export function useSeenHistory() {
  const [history] = useState(createSeenHistory);
  const [ledger, setLedger] = useState(history.ledger);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    try {
      history.flush(window.localStorage);
      setLedger(history.ledger);
    } catch {
      setNotice(
        "Could not save seen history in this browser. Save a session to keep your search history.",
      );
    }
  }, [history]);
  useEffect(() => {
    function refresh() {
      try {
        history.refresh(window.localStorage);
        setLedger(history.ledger);
        setNotice("");
      } catch {
        setNotice(
          "Could not read seen history. The original browser data has been preserved.",
        );
      }
    }
    function changed(event: StorageEvent) {
      if (event.key === seenStorageKey || event.key === null) refresh();
    }
    refresh();
    window.addEventListener("storage", changed);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [history, flush]);
  const add = useCallback(
    (delta: SeenLedger) => {
      history.add(delta);
      setLedger(history.ledger);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 250);
    },
    [history, flush],
  );
  const remember = useCallback(
    (
      results: Parameters<typeof recordSeen>[0],
      topic: string,
      sweep = false,
    ) => {
      add(
        recordSeen(
          results,
          topic,
          new Date().toISOString(),
          sweep,
          history.ledger,
        ),
      );
    },
    [history, add],
  );
  function clear() {
    try {
      history.refresh(window.localStorage);
      const count = history.ledger.entries.length;
      if (
        !window.confirm(
          `Clear seen history? This will remove ${count} ${count === 1 ? "entry" : "entries"} from this browser.`,
        )
      )
        return false;
      history.clear(window.localStorage);
      clearTimeout(timer.current);
      setLedger(history.ledger);
      setNotice("");
      return true;
    } catch {
      setNotice(
        "Could not clear seen history. The original browser data has been preserved.",
      );
      return false;
    }
  }
  return {
    ledger,
    snapshot: () => history.ledger,
    add,
    remember,
    clear,
    notice,
  };
}
