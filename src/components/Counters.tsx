import React from 'react';

interface CountersProps {
  totalParticipants: number;
  visibleParticipants: number;
  totalCourses: number;
  visibleCourses: number;
}

export const Counters: React.FC<CountersProps> = ({
  totalParticipants,
  visibleParticipants,
  totalCourses,
  visibleCourses
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="text-sm text-gray-600 mb-1">Total Participants</div>
        <div className="text-2xl font-bold text-gray-900">{totalParticipants}</div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="text-sm text-gray-600 mb-1">Visible Participants</div>
        <div className="text-2xl font-bold text-blue-600">{visibleParticipants}</div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="text-sm text-gray-600 mb-1">Total Courses</div>
        <div className="text-2xl font-bold text-gray-900">{totalCourses}</div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="text-sm text-gray-600 mb-1">Visible Courses</div>
        <div className="text-2xl font-bold text-green-600">{visibleCourses}</div>
      </div>
    </div>
  );
};
