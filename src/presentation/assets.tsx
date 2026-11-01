/**
 * CareSync Presentation Layer — Resilient Visual Assets & Avatar Components
 *
 * Keeps image imports isolated in the client presentation layer so pure Node/tsx
 * domain tests run with zero bundler dependency, while Vite bundles and hashes
 * every generated image with full fallback resilience.
 */

import React, { useState } from 'react';
import { Building2, Stethoscope } from 'lucide-react';
import clinicHeroImg from '../assets/images/caresync_clinic_hero_1793521830508.jpg';
import drSarahImg from '../assets/images/doctor_elena_vance_1793521831739.jpg';
import drKenjiImg from '../assets/images/doctor_marcus_chen_1793521833139.jpg';
import drPriyaImg from '../assets/images/doctor_priya_nair_1793521834235.jpg';
import drMarcusImg from '../assets/images/doctor_samuel_okeke_1793521834705.jpg';

const DOCTOR_IMAGE_MAP: Record<string, string> = {
  doctor_sarah_jenkins: drSarahImg,
  doctor_kenji_tanaka: drKenjiImg,
  doctor_priya_nair: drPriyaImg,
  doctor_marcus_thompson: drMarcusImg,
};

export function DoctorAvatar({
  avatarKey,
  name,
  size = 'md',
}: {
  avatarKey: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const src = DOCTOR_IMAGE_MAP[avatarKey];

  const sizeClass =
    size === 'sm'
      ? 'w-10 h-10 text-xs'
      : size === 'lg'
        ? 'w-20 h-20 text-base'
        : 'w-14 h-14 text-sm';

  const initials = name
    .replace(/^Dr\.\s*/i, '')
    .replace(/,.*$/, '')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (!src || failed) {
    return (
      <div
        className={`${sizeClass} rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/70 text-sky-700 dark:text-sky-300 font-display font-semibold flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        {initials || <Stethoscope className="w-4 h-4" />}
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shrink-0`}
    >
      <img
        src={src}
        alt={`Portrait of ${name}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover object-top"
      />
    </div>
  );
}

export function ClinicHeroVisual() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-full h-full min-h-[280px] rounded-2xl bg-gradient-to-br from-sky-50 via-slate-50 to-blue-100 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-8 text-center">
        <Building2 className="w-10 h-10 text-sky-600 dark:text-sky-400 mb-3" />
        <p className="font-display font-semibold text-slate-900 dark:text-slate-100">
          CareSync Outpatient Coordination Center
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Scheduled outpatient care, synchronized check-in queues, and resilient booking workflows
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[300px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
      <img
        src={clinicHeroImg}
        alt="Modern sunlit outpatient healthcare coordination center lounge and reception"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent flex items-end p-6">
        <div className="text-white max-w-md">
          <p className="text-xs font-medium tracking-wide text-sky-200">
            Outpatient Clinic Coordination · San Francisco Pacific Time
          </p>
          <p className="text-base font-display font-semibold mt-1">
            Deterministic slot allocation, live check-in queue visibility, and idempotent network recovery.
          </p>
        </div>
      </div>
    </div>
  );
}
