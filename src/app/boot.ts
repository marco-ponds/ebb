import { create } from 'zustand';

/** True when initStore() rejected (a non-storage open error such as a version clash), so App stops waiting. */
export const useBootStore = create<{ failed: boolean }>(() => ({ failed: false }));

export const markBootFailed = (): void => useBootStore.setState({ failed: true });
export const resetBoot = (): void => useBootStore.setState({ failed: false });
