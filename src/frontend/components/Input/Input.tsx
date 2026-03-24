import { InputContainer } from './InputContainer/InputContainer';
import { useInputSettings } from './hooks/useInputSettings';
import { useInputs } from './hooks/useInputs';
import {
  useDashboard,
  useDrivingState,
  useSessionVisibility,
} from '@irdashies/context';

export const Input = () => {
  const settings = useInputSettings();
  const inputs = useInputs(settings?.useRawValues ?? false);
  const { isDriving } = useDrivingState();
  const { editMode, isDemoMode } = useDashboard();

  if (!useSessionVisibility(settings?.sessionVisibility)) return <></>;

  if (!settings) return <></>;

  // Show only when on track setting
  if (settings?.showOnlyWhenOnTrack && !isDriving && !editMode && !isDemoMode) {
    return <></>;
  }

  return (
    <div className="h-full flex flex-col">
      <InputContainer {...inputs} settings={settings} />
    </div>
  );
};
