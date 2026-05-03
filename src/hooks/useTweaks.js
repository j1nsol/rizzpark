import { useState, useCallback } from 'react';

/**
 * Single source of truth for tweak values.
 * setTweak persists via the host (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
 *
 * Accepts either:
 *   setTweak('key', value)
 *   setTweak({ key: value, ... })
 */
export function useTweaks(defaults) {
  const [values, setValues] = useState(defaults);

  const setTweak = useCallback((keyOrEdits, val) => {
    const edits =
      typeof keyOrEdits === 'object' && keyOrEdits !== null
        ? keyOrEdits
        : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
  }, []);

  return [values, setTweak];
}
