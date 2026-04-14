import { useState, useEffect } from 'react';

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const msUntilNextMinute = 60000 - (Date.now() % 60000);
    const nextMinuteBoundary = new Date(Date.now() + msUntilNextMinute);
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let currentBoundary = nextMinuteBoundary;

    const timeoutId = setTimeout(() => {
      setNow(nextMinuteBoundary);
      intervalId = setInterval(() => {
        currentBoundary = new Date(currentBoundary.getTime() + 60000);
        setNow(currentBoundary);
      }, 60000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, []);

  return now;
}
