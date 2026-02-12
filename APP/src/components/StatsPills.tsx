import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Users, Eye, Layers, CheckCircle, GraduationCap } from 'lucide-react';

interface StatsPillsProps {
  totalParticipants: number;
  visibleParticipants: number;
  totalCourses: number;
  visibleCourses: number;
  completedCount: number;
}

export const StatsPills: React.FC<StatsPillsProps> = ({
  totalParticipants,
  visibleParticipants,
  totalCourses,
  visibleCourses,
  completedCount
}) => {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-4">
      {/* Mobile: Collapsible */}
      <div className="md:hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full bg-white rounded-lg px-2 py-2 shadow-sm border border-slate-200 flex items-center justify-between mb-1"
        >
          <div className="flex items-center gap-2">
            <div className="text-left">
              <div className="text-[11px] font-medium text-slate-500">{t('participants.showing')}</div>
              <div className="text-lg font-bold text-blue-600">{visibleParticipants}/{totalParticipants}</div>
            </div>
            <div className="text-left">
              <div className="text-[11px] font-medium text-slate-500">{t('participant.completed')}</div>
              <div className="text-lg font-bold text-emerald-700">{completedCount}</div>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="grid grid-cols-2 gap-2 mb-1">
            {/* Total */}
            <div className="bg-white rounded-xl p-2 shadow-sm border border-slate-200 border-l-4 border-l-slate-400">
              <div className="flex items-center justify-between mb-0.5">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-900 font-semibold whitespace-nowrap">{t('participants.total')}</div>
                  <div className="text-[9px] text-transparent font-medium mt-0.5 select-none">&nbsp;</div>
                </div>
                <div className="bg-slate-50 rounded-full p-1">
                  <Users className="w-3.5 h-3.5 text-slate-600" strokeWidth={2} />
                </div>
              </div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">{totalParticipants}</div>
            </div>

            {/* Showing */}
            <div className="bg-white rounded-xl p-2 shadow-sm border border-slate-200 border-l-4 border-l-blue-500">
              <div className="flex items-center justify-between mb-0.5">
                <div>
                  <div className="text-xs uppercase tracking-wide text-blue-600 font-semibold whitespace-nowrap">{t('participants.showing')}</div>
                  <div className="text-[9px] text-slate-500 font-medium mt-0.5">{t('participants.showingSubtext')}</div>
                </div>
                <div className="bg-slate-50 rounded-full p-1">
                  <Eye className="w-3.5 h-3.5 text-blue-600" strokeWidth={2} />
                </div>
              </div>
              <div className="text-2xl font-semibold tracking-tight text-blue-600">{visibleParticipants}</div>
            </div>

            {/* Total Courses */}
            <div className="bg-white rounded-xl p-2 shadow-sm border border-slate-200 border-l-4 border-l-indigo-500">
              <div className="flex items-center justify-between mb-0.5">
                <div>
                  <div className="text-xs uppercase tracking-wide text-indigo-600 font-semibold whitespace-nowrap">{t('participants.totalCourses')}</div>
                  <div className="text-[9px] text-transparent font-medium mt-0.5 select-none">&nbsp;</div>
                </div>
                <div className="bg-slate-50 rounded-full p-1">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" strokeWidth={2} />
                </div>
              </div>
              <div className="text-2xl font-semibold tracking-tight text-indigo-600">{totalCourses}</div>
            </div>

            {/* Visible Courses */}
            <div className="bg-white rounded-xl p-2 shadow-sm border border-slate-200 border-l-4 border-l-cyan-500">
              <div className="flex items-center justify-between mb-0.5">
                <div>
                  <div className="text-xs uppercase tracking-wide text-cyan-600 font-semibold whitespace-nowrap">{t('participants.visibleCourses')}</div>
                  <div className="text-[9px] text-slate-500 font-medium mt-0.5">{t('participants.visibleCoursesSubtext')}</div>
                </div>
                <div className="bg-slate-50 rounded-full p-1">
                  <CheckCircle className="w-3.5 h-3.5 text-cyan-600" strokeWidth={2} />
                </div>
              </div>
              <div className="text-2xl font-semibold tracking-tight text-cyan-600">{visibleCourses}</div>
            </div>

            {/* Completed */}
            <div className="bg-white rounded-xl p-2 shadow-sm border border-slate-200 border-l-4 border-l-amber-500 col-span-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-amber-600 font-semibold whitespace-nowrap">{t('participants.completed')}</div>
                <div className="bg-slate-50 rounded-full p-1">
                  <GraduationCap className="w-3.5 h-3.5 text-amber-600" strokeWidth={2} />
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <div className="text-xl font-semibold tracking-tight text-amber-600">{completedCount}</div>
                <div className="text-xs text-slate-500">/ {visibleParticipants} ({visibleParticipants > 0 ? Math.round((completedCount / visibleParticipants) * 100) : 0}%)</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: Always expanded */}
      <div className="hidden md:grid grid-cols-5 gap-4 mb-2">
        {/* Total */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-slate-400 hover:shadow-md transition-shadow duration-200 min-h-[120px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm uppercase tracking-wide text-slate-900 font-semibold whitespace-nowrap">{t('participants.total')}</div>
            <div className="bg-slate-50 rounded-full p-2.5">
              <Users className="w-[18px] h-[18px] text-slate-600" strokeWidth={2} />
            </div>
          </div>
          <div className="text-3xl font-semibold tracking-tight text-slate-900 mt-auto">{totalParticipants}</div>
        </div>
        
        {/* Showing */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-blue-500 hover:shadow-md transition-shadow duration-200 min-h-[120px] flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-base uppercase tracking-wide text-blue-600 font-semibold whitespace-nowrap">{t('participants.showing')}</div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5">{t('participants.showingSubtext')}</div>
            </div>
            <div className="bg-slate-50 rounded-full p-2.5">
              <Eye className="w-[18px] h-[18px] text-blue-600" strokeWidth={2} />
            </div>
          </div>
          <div className="text-4xl font-semibold tracking-tight text-blue-600 mt-auto">{visibleParticipants}</div>
        </div>
        
        {/* Total Courses */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-indigo-500 hover:shadow-md transition-shadow duration-200 min-h-[120px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm uppercase tracking-wide text-indigo-600 font-semibold whitespace-nowrap">{t('participants.totalCourses')}</div>
            <div className="bg-slate-50 rounded-full p-2.5">
              <Layers className="w-[18px] h-[18px] text-indigo-600" strokeWidth={2} />
            </div>
          </div>
          <div className="text-3xl font-semibold tracking-tight text-indigo-600 mt-auto">{totalCourses}</div>
        </div>
        
        {/* Visible Courses */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-cyan-500 hover:shadow-md transition-shadow duration-200 min-h-[120px] flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-base uppercase tracking-wide text-cyan-600 font-semibold whitespace-nowrap">{t('participants.visibleCourses')}</div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5">{t('participants.visibleCoursesSubtext')}</div>
            </div>
            <div className="bg-slate-50 rounded-full p-2.5">
              <CheckCircle className="w-[18px] h-[18px] text-cyan-600" strokeWidth={2} />
            </div>
          </div>
          <div className="text-4xl font-semibold tracking-tight text-cyan-600 mt-auto">{visibleCourses}</div>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-amber-500 hover:shadow-md transition-shadow duration-200 min-h-[120px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm uppercase tracking-wide text-amber-600 font-semibold whitespace-nowrap">{t('participants.completed')}</div>
            <div className="bg-slate-50 rounded-full p-2.5">
              <GraduationCap className="w-[18px] h-[18px] text-amber-600" strokeWidth={2} />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-auto">
            <div className="text-3xl font-semibold tracking-tight text-amber-600">{completedCount}</div>
            <div className="text-sm text-slate-500">/ {visibleParticipants} ({visibleParticipants > 0 ? Math.round((completedCount / visibleParticipants) * 100) : 0}%)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
