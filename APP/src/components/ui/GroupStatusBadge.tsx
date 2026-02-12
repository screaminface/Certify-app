import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface GroupStatusBadgeProps {
  status: 'active' | 'planned' | 'completed';
}

export const GroupStatusBadge: React.FC<GroupStatusBadgeProps> = ({ status }) => {
  const { t } = useLanguage();
  
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    planned: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    completed: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  };

  const labels = {
    active: t('group.active'),
    planned: t('group.planned'),
    completed: t('group.completed')
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
};
