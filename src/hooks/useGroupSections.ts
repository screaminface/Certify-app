import { useState, useEffect } from 'react';

const STORAGE_KEYS = {
  active: 'groups-collapsed-active',
  planned: 'groups-collapsed-planned',
  completed: 'groups-collapsed-completed'
};

export function useGroupSections() {
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const activeStored = localStorage.getItem(STORAGE_KEYS.active);
    const plannedStored = localStorage.getItem(STORAGE_KEYS.planned);
    const completedStored = localStorage.getItem(STORAGE_KEYS.completed);
    
    // Reset if any required sections are collapsed by mistake
    if (plannedStored === 'true' || activeStored === 'true') {
      localStorage.setItem(STORAGE_KEYS.active, 'false');
      localStorage.setItem(STORAGE_KEYS.planned, 'false');
      localStorage.setItem(STORAGE_KEYS.completed, 'true');
      return { active: false, planned: false, completed: true };
    }
    
    return {
      active: activeStored === 'true',
      planned: plannedStored === 'true',
      completed: completedStored === null ? true : completedStored === 'true'
    };
  });

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.active, String(collapsedSections.active));
    localStorage.setItem(STORAGE_KEYS.planned, String(collapsedSections.planned));
    localStorage.setItem(STORAGE_KEYS.completed, String(collapsedSections.completed));
  }, [collapsedSections]);

  const toggleSection = (section: 'active' | 'planned' | 'completed') => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const expandSection = (section: 'active' | 'planned' | 'completed') => {
    setCollapsedSections(prev => ({ ...prev, [section]: false }));
  };

  const expandAll = () => {
    setCollapsedSections({ active: false, planned: false, completed: false });
  };

  const resetToDefaults = () => {
    const defaultState = { active: false, planned: false, completed: true };
    setCollapsedSections(defaultState);
    localStorage.setItem(STORAGE_KEYS.active, 'false');
    localStorage.setItem(STORAGE_KEYS.planned, 'false');
    localStorage.setItem(STORAGE_KEYS.completed, 'true');
  };

  const setCollapsedState = (state: { active: boolean; planned: boolean; completed: boolean }) => {
    setCollapsedSections(state);
  };

  return {
    collapsedSections,
    toggleSection,
    expandSection,
    expandAll,
    resetToDefaults,
    setCollapsedState
  };
}
