import { useState, useEffect, useRef } from 'react';

export default function useLS(key, init) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : init;
    } catch {
      return init;
    }
  });
  const prevKey = useRef(key);
  useEffect(() => {
    if (prevKey.current !== key) {
      try {
        const s = localStorage.getItem(key);
        setV(s ? JSON.parse(s) : init);
      } catch {
        setV(init);
      }
      prevKey.current = key;
    }
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {
      if (e?.name === 'QuotaExceededError') console.error('localStorage full');
    }
  }, [key, v]);
  return [v, setV];
}
