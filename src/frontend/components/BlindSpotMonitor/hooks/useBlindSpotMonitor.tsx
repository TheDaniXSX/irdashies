import { useMemo, useState, useEffect } from 'react';
import {
  useTelemetryValues,
  useTelemetryValue,
  useDriverCarIdx,
  useTrackLength,
} from '@irdashies/context';
import { useBlindSpotMonitorSettings } from './useBlindSpotMonitorSettings';
import { CarLeftRight } from '@irdashies/types';

interface BlindSpotMonitorState {
  show: boolean;
  leftState: CarLeftRight;
  rightState: CarLeftRight;
  leftPercent: number;
  rightPercent: number;
  disableTransition: boolean;
}

const FALLBACK_PROXIMITY_FACTOR = 0.35;
const MIN_FALLBACK_PROXIMITY_METERS = 1;

export const useBlindSpotMonitor = (): BlindSpotMonitorState => {
  const carLeftRight =
    useTelemetryValue<CarLeftRight>('CarLeftRight') ?? CarLeftRight.Off;
  const lapDistPcts = useTelemetryValues<number[]>('CarIdxLapDistPct');
  const carIdxOnPitRoad = useTelemetryValues('CarIdxOnPitRoad');
  const driverCarIdx = useDriverCarIdx();
  const trackLength = useTrackLength();
  const settings = useBlindSpotMonitorSettings();
  const isOnTrack = useTelemetryValue<boolean>('IsOnTrack') ?? false;

  const [leftCarIdx, setLeftCarIdx] = useState<number | null>(null);
  const [rightCarIdx, setRightCarIdx] = useState<number | null>(null);
  const [prevPercents, setPrevPercents] = useState<{
    left: number | null;
    right: number | null;
  }>({
    left: null,
    right: null,
  });

  const result = useMemo(() => {
    const defaultState = {
      show: false,
      leftState: CarLeftRight.Off,
      rightState: CarLeftRight.Off,
      leftPercent: 0,
      rightPercent: 0,
      disableTransition: false,
    };

    if (!lapDistPcts || driverCarIdx === undefined || !settings || !isOnTrack) {
      return defaultState;
    }

    if (!Number.isFinite(trackLength) || trackLength <= 0) {
      return defaultState;
    }

    const driverCarDistPct = lapDistPcts[driverCarIdx];
    if (driverCarDistPct === undefined || driverCarDistPct === -1)
      return defaultState;

    const maxDistAPct = (settings.distAhead ?? 4) / trackLength;
    const maxDistBPct = (settings.distBehind ?? 4) / trackLength;

    const calculateRelativeDiff = (idx: number): number => {
      let diff = lapDistPcts[idx] - driverCarDistPct;
      if (diff > 0.5) diff -= 1;
      else if (diff < -0.5) diff += 1;
      return diff;
    };

    const calculatePercent = (idx: number | null): number => {
      if (
        idx === null ||
        lapDistPcts[idx] === undefined ||
        lapDistPcts[idx] === -1
      )
        return 0;
      const diff = calculateRelativeDiff(idx);
      const percent = diff / (diff > 0 ? maxDistAPct : maxDistBPct);
      return Math.round(Math.max(-1, Math.min(1, percent)) * 1000) / 1000;
    };

    let leftState = CarLeftRight.Off;
    let rightState = CarLeftRight.Off;
    let leftPercent = 0;
    let rightPercent = 0;
    let disableTransition = false;

    const is3WideFromSpotter = carLeftRight === CarLeftRight.CarLeftRight;
    const hasLeftFromSpotter =
      is3WideFromSpotter ||
      carLeftRight === CarLeftRight.CarLeft ||
      carLeftRight === CarLeftRight.Cars2Left;
    const hasRightFromSpotter =
      is3WideFromSpotter ||
      carLeftRight === CarLeftRight.CarRight ||
      carLeftRight === CarLeftRight.Cars2Right;

    const hasSpotterSignal = hasLeftFromSpotter || hasRightFromSpotter;

    let fallbackCarIdx: number | null = null;
    const proximityFallbackEnabled = settings.enableProximityFallback ?? true;
    if (!hasSpotterSignal && proximityFallbackEnabled) {
      const nearestThresholdMeters =
        Math.min(settings.distAhead ?? 4, settings.distBehind ?? 4) *
        FALLBACK_PROXIMITY_FACTOR;
      const proximityThresholdPct =
        Math.max(MIN_FALLBACK_PROXIMITY_METERS, nearestThresholdMeters) /
        trackLength;

      let closestAbsDiff = Number.POSITIVE_INFINITY;
      for (let i = 0; i < lapDistPcts.length; i++) {
        if (
          i === driverCarIdx ||
          lapDistPcts[i] === undefined ||
          lapDistPcts[i] === -1 ||
          carIdxOnPitRoad?.[i]
        ) {
          continue;
        }

        const diff = calculateRelativeDiff(i);
        const absDiff = Math.abs(diff);

        if (absDiff > proximityThresholdPct) {
          continue;
        }

        if (absDiff < closestAbsDiff) {
          closestAbsDiff = absDiff;
          fallbackCarIdx = i;
        }
      }
    }

    if (hasSpotterSignal && hasLeftFromSpotter) {
      leftState =
        carLeftRight === CarLeftRight.Cars2Left
          ? CarLeftRight.Cars2Left
          : CarLeftRight.CarLeft;

      leftPercent =
        is3WideFromSpotter && leftCarIdx === null
          ? 0
          : calculatePercent(leftCarIdx);
    }

    if (hasSpotterSignal && hasRightFromSpotter) {
      rightState =
        carLeftRight === CarLeftRight.Cars2Right
          ? CarLeftRight.Cars2Right
          : CarLeftRight.CarRight;

      rightPercent =
        is3WideFromSpotter && rightCarIdx === null
          ? 0
          : calculatePercent(rightCarIdx);
    }

    if (!hasSpotterSignal && fallbackCarIdx !== null) {
      const fallbackPercent = calculatePercent(fallbackCarIdx);
      leftState = CarLeftRight.CarLeft;
      rightState = CarLeftRight.CarRight;
      leftPercent = fallbackPercent;
      rightPercent = fallbackPercent;
    }

    const hasLargeTransitionDelta = (prev: number | null, current: number) =>
      prev !== null && Math.abs(prev - current) > 0.5;

    if (leftState !== CarLeftRight.Off) {
      disableTransition =
        disableTransition ||
        hasLargeTransitionDelta(prevPercents.left, leftPercent);
    }
    if (rightState !== CarLeftRight.Off) {
      disableTransition =
        disableTransition ||
        hasLargeTransitionDelta(prevPercents.right, rightPercent);
    }

    if (leftState === CarLeftRight.Off && rightState === CarLeftRight.Off) {
      return defaultState;
    }

    return {
      show: true,
      leftState,
      rightState,
      leftPercent,
      rightPercent,
      disableTransition,
    };
  }, [
    carLeftRight,
    lapDistPcts,
    driverCarIdx,
    trackLength,
    settings,
    isOnTrack,
    carIdxOnPitRoad,
    leftCarIdx,
    rightCarIdx,
    prevPercents,
  ]);

  useEffect(() => {
    const nextPrevPercents = {
      left: result.leftPercent !== 0 ? result.leftPercent : null,
      right: result.rightPercent !== 0 ? result.rightPercent : null,
    };

    if (carLeftRight <= CarLeftRight.Clear) {
      if (leftCarIdx !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLeftCarIdx(null);
      }
      if (rightCarIdx !== null) {
        setRightCarIdx(null);
      }
      setPrevPercents((prev) =>
        prev.left === nextPrevPercents.left &&
        prev.right === nextPrevPercents.right
          ? prev
          : nextPrevPercents
      );
      return;
    }

    if (!lapDistPcts || driverCarIdx === undefined) {
      if (leftCarIdx !== null) {
        setLeftCarIdx(null);
      }
      if (rightCarIdx !== null) {
        setRightCarIdx(null);
      }
      setPrevPercents((prev) =>
        prev.left === nextPrevPercents.left &&
        prev.right === nextPrevPercents.right
          ? prev
          : nextPrevPercents
      );
      return;
    }

    const driverDist = lapDistPcts[driverCarIdx];
    if (driverDist === undefined || driverDist === -1) {
      if (leftCarIdx !== null) {
        setLeftCarIdx(null);
      }
      if (rightCarIdx !== null) {
        setRightCarIdx(null);
      }
      setPrevPercents((prev) =>
        prev.left === nextPrevPercents.left &&
        prev.right === nextPrevPercents.right
          ? prev
          : nextPrevPercents
      );
      return;
    }

    const findClosestExcluding = (excludeIdx: number | null) => {
      let closestDist = 1;
      let closestIdx: number | null = null;
      for (let i = 0; i < lapDistPcts.length; i++) {
        if (
          i === driverCarIdx ||
          i === excludeIdx ||
          lapDistPcts[i] === undefined ||
          lapDistPcts[i] === -1 ||
          carIdxOnPitRoad?.[i]
        )
          continue;
        let d = Math.abs(driverDist - lapDistPcts[i]);
        if (d > 0.5) d = 1 - d;
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }
      return closestIdx;
    };

    const is3Wide = carLeftRight === CarLeftRight.CarLeftRight;
    const isLeftOnly =
      carLeftRight === CarLeftRight.CarLeft ||
      carLeftRight === CarLeftRight.Cars2Left;
    const isRightOnly =
      carLeftRight === CarLeftRight.CarRight ||
      carLeftRight === CarLeftRight.Cars2Right;

    if (isLeftOnly) {
      const closest = findClosestExcluding(null);
      if (leftCarIdx !== closest) {
        setLeftCarIdx(closest);
      }
      if (rightCarIdx !== null) {
        setRightCarIdx(null);
      }
    } else if (isRightOnly) {
      const closest = findClosestExcluding(null);
      if (rightCarIdx !== closest) {
        setRightCarIdx(closest);
      }
      if (leftCarIdx !== null) {
        setLeftCarIdx(null);
      }
    } else if (is3Wide) {
      if (leftCarIdx === null && rightCarIdx === null) {
        const firstClosest = findClosestExcluding(null);
        const secondClosest = findClosestExcluding(firstClosest);

        if (leftCarIdx !== firstClosest) {
          setLeftCarIdx(firstClosest);
        }
        if (rightCarIdx !== secondClosest) {
          setRightCarIdx(secondClosest);
        }
      } else if (leftCarIdx !== null && rightCarIdx === null) {
        const nextRight = findClosestExcluding(leftCarIdx);
        if (rightCarIdx !== nextRight) {
          setRightCarIdx(nextRight);
        }
      } else if (rightCarIdx !== null && leftCarIdx === null) {
        const nextLeft = findClosestExcluding(rightCarIdx);
        if (leftCarIdx !== nextLeft) {
          setLeftCarIdx(nextLeft);
        }
      }
    }

    setPrevPercents((prev) =>
      prev.left === nextPrevPercents.left &&
      prev.right === nextPrevPercents.right
        ? prev
        : nextPrevPercents
    );
  }, [
    result.show,
    carLeftRight,
    lapDistPcts,
    carIdxOnPitRoad,
    driverCarIdx,
    result.leftPercent,
    result.rightPercent,
    leftCarIdx,
    rightCarIdx,
  ]);

  return result;
};
