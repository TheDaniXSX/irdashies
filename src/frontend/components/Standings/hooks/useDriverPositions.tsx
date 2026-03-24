// Cambios: Se añade cálculo de iRating para Relative en carreras oficiales reutilizando augmentStandingsWithIRating, manteniendo el orden de filas actual y sin alterar Practice.
import { useMemo } from 'react';
import {
  useTelemetryValue,
  useTelemetry,
  useSessionDrivers,
  useSessionQualifyingResults,
  useCurrentSessionType,
  useCarLap,
  usePitLap,
  usePrevCarTrackSurface,
  useFocusCarIdx,
  useSessionPositions,
  useSessionIsOfficial,
  useTelemetryValues,
  useTelemetryValuesRounded,
} from '@irdashies/context';

import {
  Standings,
  type LastTimeState,
  augmentStandingsWithIRating,
  groupStandingsByClass,
} from '../createStandings';
import { GlobalFlags, SessionState } from '@irdashies/types';
import { useDriverLivePositions } from './useDriverLivePositions';
import { useRelativeSettings } from './useRelativeSettings';

const getLastTimeState = (
  lastTime: number | undefined,
  fastestTime: number | undefined,
  hasFastestTime: boolean
): LastTimeState => {
  if (
    lastTime !== undefined &&
    fastestTime !== undefined &&
    lastTime === fastestTime
  ) {
    return hasFastestTime ? 'session-fastest' : 'personal-best';
  }
  return undefined;
};

export const useDriverPositions = () => {
  const carIdxPosition = useTelemetry('CarIdxPosition');
  const carIdxClassPosition = useTelemetry('CarIdxClassPosition');
  const carIdxBestLap = useTelemetry('CarIdxBestLapTime');
  const carIdxLastLapTime = useTelemetry('CarIdxLastLapTime');
  const carIdxF2Time = useTelemetryValuesRounded('CarIdxF2Time', 2);
  const carIdxLapNum = useTelemetry('CarIdxLap');
  const carIdxTrackSurface = useTelemetry('CarIdxTrackSurface');
  const prevCarTrackSurface = usePrevCarTrackSurface();
  const lastPitLap = usePitLap();
  const lastLap = useCarLap();
  const carIdxLapDstPct = useTelemetryValues('CarIdxLapDistPct');

  const positions = useMemo(() => {
    return (
      carIdxPosition?.value?.map((position, carIdx) => ({
        carIdx,
        position,
        classPosition: carIdxClassPosition?.value?.[carIdx],
        delta: carIdxF2Time[carIdx], // only to leader currently, need to handle non-race sessions
        bestLap: carIdxBestLap?.value?.[carIdx],
        lastLap: lastLap[carIdx] ?? -1,
        lastLapTime: carIdxLastLapTime?.value?.[carIdx] ?? -1,
        lapNum: carIdxLapNum?.value?.[carIdx],
        lapDstPct: carIdxLapDstPct[carIdx] ?? 0,
        lastPitLap: lastPitLap[carIdx] ?? undefined,
        prevCarTrackSurface: prevCarTrackSurface[carIdx] ?? undefined,
        carTrackSurface: carIdxTrackSurface?.value?.[carIdx],
      })) ?? []
    );
  }, [
    carIdxPosition?.value,
    carIdxClassPosition?.value,
    carIdxBestLap?.value,
    carIdxLastLapTime?.value,
    lastLap,
    carIdxF2Time,
    carIdxLapNum?.value,
    carIdxLapDstPct,
    lastPitLap,
    prevCarTrackSurface,
    carIdxTrackSurface?.value,
  ]);

  return positions;
};

export const useDrivers = () => {
  const sessionDrivers = useSessionDrivers();
  const drivers =
    sessionDrivers?.map((driver) => ({
      carIdx: driver.CarIdx,
      name: driver.UserName,
      carNum: driver.CarNumber,
      carNumRaw: driver.CarNumberRaw,
      license: driver.LicString,
      rating: driver.IRating,
      flairId: driver.FlairID,
      teamName: driver.TeamName,
      carClass: {
        id: driver.CarClassID,
        color: driver.CarClassColor,
        name: driver.CarClassShortName,
        relativeSpeed: driver.CarClassRelSpeed,
        estLapTime: driver.CarClassEstLapTime,
      },
      carId: driver.CarID,
    })) ?? [];
  return drivers;
};

export const useCarState = () => {
  const carIdxTrackSurface = useTelemetryValues<number[]>('CarIdxTrackSurface');
  const carIdxOnPitRoad = useTelemetryValues<boolean[]>('CarIdxOnPitRoad');
  const carIdxTireCompound = useTelemetryValues<number[]>('CarIdxTireCompound');
  const carIdxSessionFlags = useTelemetryValues<number[]>('CarIdxSessionFlags');

  return useMemo(() => {
    const maxCarCount = Math.max(
      carIdxTrackSurface?.length ?? 0,
      carIdxOnPitRoad?.length ?? 0,
      carIdxTireCompound?.length ?? 0,
      carIdxSessionFlags?.length ?? 0
    );

    if (maxCarCount === 0) {
      return [];
    }

    return Array.from({ length: maxCarCount }, (_, index) => ({
      carIdx: index,
      onTrack: (carIdxTrackSurface?.[index] ?? -1) > -1,
      onPitRoad: carIdxOnPitRoad?.[index] ?? false,
      tireCompound: carIdxTireCompound?.[index],
      dnf: !!((carIdxSessionFlags?.[index] ?? 0) & GlobalFlags.Disqualify),
      repair: !!((carIdxSessionFlags?.[index] ?? 0) & GlobalFlags.Repair),
      penalty: !!((carIdxSessionFlags?.[index] ?? 0) & GlobalFlags.Black),
      slowdown: !!((carIdxSessionFlags?.[index] ?? 0) & GlobalFlags.Furled),
    }));
  }, [
    carIdxTrackSurface,
    carIdxOnPitRoad,
    carIdxTireCompound,
    carIdxSessionFlags,
  ]);
};

// TODO: this should eventually replace the useDriverStandings hook
// currently there's still a few bugs to handle but is only used in relative right now
export const useDriverStandings = () => {
  const driverPositions = useDriverPositions();
  const relativeSettings = useRelativeSettings();
  const useLivePositionStandings = relativeSettings?.useLivePosition ?? false;
  const driverLivePositions = useDriverLivePositions({
    enabled: useLivePositionStandings,
  });
  const drivers = useDrivers();
  const radioTransmitCarIdx = useTelemetryValue('RadioTransmitCarIdx');
  const carStates = useCarState();
  // Use focus car index which handles spectator mode (uses CamCarIdx when spectating)
  const playerCarIdx = useFocusCarIdx();
  const sessionType = useCurrentSessionType();
  const isOfficial = useSessionIsOfficial();
  const qualifyingPositions = useSessionQualifyingResults();
  const sessionState = useTelemetryValue('SessionState') ?? 0;
  const sessionNum = useTelemetryValue('SessionNum');
  const sessionPositions = useSessionPositions(sessionNum);

  const driverStandings: Standings[] = useMemo(() => {
    const fastestTime = driverPositions.reduce(
      (fastest, pos) => {
        if (pos.bestLap !== undefined && pos.bestLap > 0) {
          return fastest === undefined || pos.bestLap < fastest
            ? pos.bestLap
            : fastest;
        }
        return fastest;
      },
      undefined as number | undefined
    );

    // Create Map lookups for O(1) access instead of O(n) find() calls
    const driverPositionsByCarIdx = new Map(
      driverPositions.map((pos) => [pos.carIdx, pos])
    );
    const carStatesByCarIdx = new Map(
      carStates.map((state) => [state.carIdx, state])
    );
    const sessionPositionsMap = new Map(
      sessionPositions?.map((position) => [position.CarIdx, position]) ?? []
    );
    const qualifyingPositionsByCarIdx =
      qualifyingPositions && Array.isArray(qualifyingPositions)
        ? new Map(qualifyingPositions.map((q) => [q.CarIdx, q]))
        : new Map();

    const playerLap =
      playerCarIdx !== undefined
        ? (driverPositionsByCarIdx.get(playerCarIdx)?.lapNum ?? 0)
        : 0;
    const playerLapDistPct =
      playerCarIdx !== undefined
        ? (driverPositionsByCarIdx.get(playerCarIdx)?.lapDstPct ?? 0)
        : 0;

    const standings = drivers.map((driver) => {
      const driverPos = driverPositionsByCarIdx.get(driver.carIdx);

      if (!driverPos) return undefined;

      const carState = carStatesByCarIdx.get(driver.carIdx);

      let lappedState: 'ahead' | 'behind' | 'same' | undefined = undefined;
      if (sessionType === 'Race') {
        const lapDiff = Math.round(
          driverPos.lapNum +
            driverPos.lapDstPct -
            (playerLap + playerLapDistPct)
        );
        if (lapDiff > 0) lappedState = 'ahead';
        if (lapDiff < 0) lappedState = 'behind';
        if (lapDiff === 0) lappedState = 'same';
      }

      // If the driver is not in the standings, use the qualifying position
      let classPosition: number | undefined = driverPos.classPosition;

      if (useLivePositionStandings) {
        // Override position with live position based on telemetry
        const livePosition = driverLivePositions[driver.carIdx];
        if (livePosition !== undefined) classPosition = livePosition;
      }

      if (classPosition <= 0) {
        // Class position can become 0 or negative in some edge cases
        // Before race start it seems to be fine to default to qualifying position
        // During the race class position should be available
        // After the race we can fallback to session position
        if (sessionState !== SessionState.CoolDown) {
          const qualifyingPosition = qualifyingPositionsByCarIdx.get(
            driver.carIdx
          );
          classPosition = qualifyingPosition
            ? qualifyingPosition.Position + 1
            : undefined;
        } else {
          const sessionPosition = sessionPositionsMap.get(driver.carIdx);
          classPosition = sessionPosition
            ? sessionPosition.ClassPosition + 1
            : undefined;
        }
      }

      const hasFastestTime =
        driverPos.bestLap !== undefined &&
        fastestTime !== undefined &&
        driverPos.bestLap === fastestTime;

      return {
        carIdx: driver.carIdx,
        position: driverPos.position,
        lap: driverPos.lapNum,
        lappedState,
        classPosition,
        delta: driverPos.delta,
        isPlayer: playerCarIdx === driver.carIdx,
        driver: {
          name: driver.name,
          carNum: driver.carNum,
          license: driver.license,
          rating: driver.rating,
          flairId: driver.flairId,
          teamName: driver.teamName,
        },
        fastestTime: driverPos.bestLap,
        hasFastestTime,
        lastTime: driverPos.lastLapTime,
        lastTimeState: getLastTimeState(
          driverPos.lastLapTime,
          driverPos.bestLap,
          hasFastestTime
        ),
        onPitRoad: carState?.onPitRoad ?? false,
        onTrack: carState?.onTrack ?? false,
        tireCompound: carState?.tireCompound ?? 0,
        carClass: driver.carClass,
        radioActive: driverPos.carIdx === radioTransmitCarIdx,
        carId: driver.carId,
        lastPitLap: driverPos.lastPitLap,
        lastLap: driverPos.lastLap,
        prevCarTrackSurface: driverPos.prevCarTrackSurface,
        carTrackSurface: driverPos.carTrackSurface,
        currentSessionType: sessionType,
        dnf: carState?.dnf ?? false,
        repair: carState?.repair ?? false,
        penalty: carState?.penalty ?? false,
        slowdown: carState?.slowdown ?? false,
        relativePct: 0,
      };
    });

    const sortedStandings = standings
      .filter(
        (
          standing
        ): standing is Exclude<(typeof standings)[number], undefined> =>
          standing !== undefined
      )
      .sort(
        (a, b) =>
          (a.position ?? Number.MAX_SAFE_INTEGER) -
          (b.position ?? Number.MAX_SAFE_INTEGER)
      );

    if (sessionType !== 'Race' || !isOfficial) {
      return sortedStandings;
    }

    const groupedByClass = groupStandingsByClass(sortedStandings);
    const iratingAugmentedGroupedByClass =
      augmentStandingsWithIRating(groupedByClass);

    const iratingChangeMap = new Map<number, number | undefined>();
    for (const [, classStandings] of iratingAugmentedGroupedByClass) {
      for (const standing of classStandings) {
        iratingChangeMap.set(standing.carIdx, standing.iratingChange);
      }
    }

    return sortedStandings.map((standing) => ({
      ...standing,
      iratingChange: iratingChangeMap.get(standing.carIdx),
    }));
  }, [
    sessionPositions,
    sessionState,
    driverPositions,
    carStates,
    qualifyingPositions,
    playerCarIdx,
    drivers,
    sessionType,
    isOfficial,
    useLivePositionStandings,
    radioTransmitCarIdx,
    driverLivePositions,
  ]);

  return driverStandings;
};
