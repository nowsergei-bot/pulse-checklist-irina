import { createContext, useContext } from 'react';

export type VoiceFormFillContextValue = {
  active: boolean;
  activeFieldId: string | null;
};

export const VoiceFormFillContext = createContext<VoiceFormFillContextValue>({
  active: false,
  activeFieldId: null,
});

export function useVoiceFormFillContext(): VoiceFormFillContextValue {
  return useContext(VoiceFormFillContext);
}
