import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MapPin } from 'lucide-react';

interface StateData {
  count: number;
  percentage: number;
}

interface BrazilMapProps {
  clientsByState: Record<string, number>;
  totalClients: number;
}

// Real geographic SVG paths for Brazilian states
const BRAZIL_STATES: Record<string, { path: string; name: string; abbr: string }> = {
  AC: {
    abbr: 'AC', name: 'Acre',
    path: 'M48.9,134.5l-0.3,3.4l-2.9,2.9l-0.6,2.1l1.2,1.9l-0.4,2.5l-3.8,3.8l-0.4,4.6l-4.6,5.9l0.4,1.7l-0.8,2.5l2.1,3.4l-1.3,3.4l1.9,2.1l-0.6,3.3l2.9,3.8l0.6,2.9l1.9,1.3l0.8-2.5l4.8-5l-0.8-2.9l2.1-2.5l0.2-4.2l7.1-6.1l2.5-1.3l-0.8-3.4l-1.9-1.7l0.2-2.5l-2.5-3l0.6-4.2l-1.3-0.4l-0.6-2.9l-2.1-2.1l0.4-3.4l-2.1-2.9Z'
  },
  AL: {
    abbr: 'AL', name: 'Alagoas',
    path: 'M407.5,153.9l-2.9,0.6l-5,2.9l-4.2,0.4l-3.4,2.5l0.4,5l2.5,0.4l2.9-2.5l3.4-0.8l3.8-2.9l2.5-2.1l0.8-2.9Z'
  },
  AP: {
    abbr: 'AP', name: 'Amapá',
    path: 'M236.5,42.9l2.1,5.4l3.8,3.4l-0.4,5l-5.4,5.9l-2.5-0.4l-2.5,2.9l-5.4-0.8l-1.7,1.3l-0.8-1.7l1.3-4.2l-1.7-5l0.8-4.6l2.1-2.1l0.4-4.2l2.9-2.5l3.8,0.4Z'
  },
  AM: {
    abbr: 'AM', name: 'Amazonas',
    path: 'M49.2,95l5.8,2.1l5.4,0.4l2.5,2.9l5.8,1.3l5.4,4.6l6.3,0.8l2.9,3.4l6.3,2.1l0.4,3.4l5.4,2.1l5.4-2.1l2.9,1.3l5.8-2.5l3.4,1.3l0.8,4.2l2.5,0.8l5.4-3.8l3.4,0.4l1.3,2.5l4.6-0.8l2.5,2.1l4.2-2.5l4.6,0.8l0.4,2.5l5.4,0.8l2.1,2.1l6.7-0.4l2.1,2.1l4.6-0.8l2.5-3.4l5-0.4l3.4-2.9l5.4,0.4l2.1-2.9l-0.4-4.2l2.5-2.1l-1.7-3.4l-5-1.3l-0.8-5l2.9-2.5l-0.8-3.8l2.1-2.5l-0.4-4.6l-4.2,0.8l-1.7-2.5l-5.4,1.3l-1.3,2.9l-3.4,0.4l-2.9-2.1l-5,1.7l-0.4-3.4l-3.8-0.8l-5.4,4.6l-5,0.4l-2.5-2.1l-4.2,2.1l-2.9-1.7l-5.4,0.8l-2.1,3l-4.6-0.4l-2.5-2.5l-5.4,0.4l-1.7,2.9l-4.2-1.3l-0.8-2.9l-4.6,0.8l-2.9-3.4l-4.6,0.4l-1.3-2.9l-5.4,0.4l-2.1,2.5l-4.2-1.7l-5,2.9l-3.8-0.4l-1.7,3.4l-5-0.8l-2.5,2.1l-4.6-1.7Z'
  },
  BA: {
    abbr: 'BA', name: 'Bahia',
    path: 'M355.2,135l5.8,3.8l7.5,0.4l2.5,5l7.1,3.4l1.7,5.4l5.4,3.4l-0.4,5.4l2.9,2.1l-0.8,7.5l-2.9,5l0.8,3.4l-2.1,9.2l1.3,3.8l-1.3,2.5l1.3,5l2.9,2.1l-0.4,6.7l-2.5,0.4l-1.7,5.4l-2.5,2.5l0.8,3.4l-5,5.8l-5.4,2.1l-2.5-0.8l-5.8,2.5l-5-0.4l-1.7-2.5l-5,0.4l-2.9-2.1l-5.8,0.4l-5.4-5l-7.1,0.4l-2.5-3.8l-5.8,0.4l-3.4-3.4l0.8-8.3l-2.5-0.4l0.4-4.6l-1.3-5.4l1.3-9.6l2.1-2.1l-2.5-6.3l2.5-0.8l-0.4-3.4l2.9-5l0.4-6.7l3.8-2.1l-0.8-3l2.9-5.4l6.3-5.4l1.3-4.2l3.8-2.5l0.4-5.4l4.6-0.8l1.3-2.9Z'
  },
  CE: {
    abbr: 'CE', name: 'Ceará',
    path: 'M376.6,96.5l3.4,2.9l5.8,0.8l3.4,3.4l6.3,2.5l1.7,5.4l5,2.9l2.5,5.4l-0.8,3.8l-5.4,5.4l-2.5-0.4l-5.8,2.5l-3.4-1.3l-5.4,2.9l-5-0.4l-2.5-3.8l-0.4-5l2.1-5.4l-1.7-5.8l0.4-5.4l-2.5-3.4l1.3-3.8l3.4-0.4Z'
  },
  DF: {
    abbr: 'DF', name: 'Distrito Federal',
    path: 'M287.5,207.1l3.4,0.8l2.1,2.9l-0.4,3.4l-2.9,1.3l-3.4-0.8l-1.7-2.9l0.4-3.4l2.5-1.3Z'
  },
  ES: {
    abbr: 'ES', name: 'Espírito Santo',
    path: 'M369.4,229.6l1.7,2.1l-0.8,6.3l2.1,5.4l5,6.7l-0.8,3.8l-2.5,2.5l-5.4-0.8l-5-2.9l0.4-6.3l-0.8-5l2.5-5.8l0.4-4.6l3.4-1.3Z'
  },
  GO: {
    abbr: 'GO', name: 'Goiás',
    path: 'M269.3,184.2l5.4,0.8l5.8,5l3.8-0.4l6.7,6.3l0.4,3.4l3.4,0.8l2.1,2.9l-0.4,3.4l-2.9,1.3l-3.4-0.8l-1.7-2.9l0.4-3.4l-4.6,2.9l-2.1,5.4l2.5,3.8l-0.8,5.4l1.7,2.9l-0.8,6.3l-2.9,2.1l0.4,5l-4.6,5.8l-0.8,4.6l-2.9,2.1l-8.3,0.8l-5.4-3l-6.7,0.4l-2.1-5l-3.4-0.8l-0.8-4.6l-3.4-3.4l0.4-3.8l2.5-0.4l0.4-8.3l3.4-1.3l5.8-6.7l0.4-3.8l-2.1-4.6l1.7-5.4l-0.8-5l2.1-3.4l5.4,0.4l5-3.4Z'
  },
  MA: {
    abbr: 'MA', name: 'Maranhão',
    path: 'M296,74.5l5.8,0.4l2.5,5.4l5.8,2.1l2.5,5l-0.8,4.2l2.9,2.1l-0.8,3.8l2.9,4.6l-2.1,4.6l2.5,5.4l-0.4,4.6l2.5,2.9l-3.8,5l-6.3,4.2l-2.9-0.4l-2.1,2.5l-5.8,0.4l-2.5-5l-5.4,0.4l-2.5-2.5l-5.4,0.8l-0.4-3.8l-5-1.7l-2.1-3.4l-0.4-8.3l-2.9-5l0.4-3.8l-1.7-3.8l5.4-0.4l2.5-4.6l5-0.8l5.8-5l5-0.4l2.5-3.4l1.7-6.3Z'
  },
  MT: {
    abbr: 'MT', name: 'Mato Grosso',
    path: 'M198.5,134.8l5.4,0.8l3.4,4.2l5.8,0.4l5-3.4l5.4,2.1l4.2-0.8l3.8,5.4l6.3-0.4l0.8,3.4l5,2.5l3.4-1.3l3.8,1.7l-0.8,5l3.8,3l-0.4,4.6l4.6,5.4l-0.4,4.6l-3.4,2.5l0.4,5.4l-2.5,5.8l0.8,5.4l-2.1,3.4l0.8,5l-1.7,5.4l2.1,4.6l-0.4,3.8l-5.8,6.7l-3.4,1.3l-0.4,8.3l-2.5,0.4l-0.4,3.8l-6.3-0.4l-3.8-3.4l-5.4,0.4l-2.9-2.1l-5.8-0.4l-3.4,2.5l-5.4-0.8l-11.3-10.8l-0.8-10.4l-5.8-0.4l-4.6-4.2l-5.8,0.4l-1.7-4.6l1.7-5.4l-5-2.9l0.4-5l-1.7-4.6l0.4-5l2.9-2.9l-0.8-4.6l2.9-3l0.8-6.7l2.5-0.8l0.8-3.8l3.8-0.4l0.4-3.4Z'
  },
  MS: {
    abbr: 'MS', name: 'Mato Grosso do Sul',
    path: 'M234.5,232.5l5.4,0.8l2.9,2.1l5.8,0.4l3.4-2.5l5.4,0.8l2.9,2.1l3.8,3.4l6.3,0.4l3.8,5l-0.4,5l-2.5,5.4l1.3,4.2l-2.9,5l0.8,3.4l-1.7,4.6l-3.4,2.1l0.4,4.6l-5.4,5l-5,0.4l-5.8-2.5l-2.5,0.8l-5.8,5.8l-5.8-0.4l-2.9-2.5l-5.8,0.4l-3.4-2.5l-0.4-4.2l-4.6-4.2l2.1-8.3l-0.8-8.3l3-4.6l-0.8-5.4l3.8-3.8l-0.4-5l6.3-5Z'
  },
  MG: {
    abbr: 'MG', name: 'Minas Gerais',
    path: 'M289.9,214.4l3.4,0.8l4.6-2.9l0.4-3.4l2.9-1.3l3.4,0.8l1.7,2.9l-0.4,3.4l2.5-0.4l1.3,5.4l-0.4,4.6l2.5,0.8l-0.8,8.3l3.4,3.4l0.8,4.6l3.4,0.8l2.1,5l6.7-0.4l5.4,3l8.3-0.8l2.9-2.1l0.8-4.6l4.6-5.8l-0.4-5l2.9-2.1l0.8-6.3l-1.7-2.9l0.8-5.4l-2.5-3.8l2.1-5.4l4.6-2.9l5.4,2.5l5-5.8l-0.8-3.4l2.5-2.5l1.7-5.4l2.5-0.4l0.4-6.7l-2.9-2.1l-1.3-5l1.3-2.5l-1.3-3.8l2.1-9.2l-0.8-3.4l-5.4,0.8l-2.5-5.4l-5.8,0.4l-2.5,2.5l-6.7-1.3l-2.5,2.1l-5-0.4l-5.8,2.9l-2.9-0.8l-2.5,2.9l-5.8,0.4l-2.9,5.8l-5,0.4l-2.5,3.4l-5.8,0.4l-0.4,3.4l-3.4,0.8l-0.8,5.4l-5,0.4l-2.5,3.8l-0.4,5.4l3.4,0.8l0.8,4.6l3.8,3.8l-0.4,6.3l2.5,3.8Z'
  },
  PA: {
    abbr: 'PA', name: 'Pará',
    path: 'M178.5,56.5l5.4,0.4l2.1,3.8l5.8,0.8l2.5-2.5l5.8,0.4l0.8,2.9l5,0.8l2.5-2.9l5.4,0.4l1.7,3.8l5.4-0.4l2.1-3.4l5-0.4l2.9,2.5l5.4-0.8l0.8-2.5l5-0.4l2.1,2.1l-0.4,4.6l3.4,2.9l1.7-2.5l5.4,0.4l2.1,5l-1.3,4.2l0.8,1.7l-1.7,6.3l-2.5,3.4l-5,0.4l-5.8,5l-5,0.8l-2.5,4.6l-5.4,0.4l1.7,3.8l-0.4,3.8l2.9,5l0.4,8.3l2.1,3.4l5,1.7l0.4,3.8l-3.8,0.4l-0.8,3.4l-5.4,0.4l-5,3.8l-2.5-2.5l-5.8,0.4l-2.5,2.5l-5.4-0.4l-3.4,2.5l-0.4,3.8l-5.4,2.9l-1.7-2.1l-5.8,0.4l-2.5-2.5l-3.4,0.4l-5-2.5l-0.8-3.4l-6.3,0.4l-3.8-5.4l-4.2,0.8l-5.4-2.1l-5,3.4l-5.8-0.4l-3.4-4.2l-5.4-0.8l-0.4-3.4l3.8,0.4l-0.4-2.5l-4.6-0.8l-4.2,2.5l-2.5-2.1l-4.6,0.8l-1.3-2.5l-3.4-0.4l-5.4,3.8l-2.5-0.8l-0.8-4.2l-3.4-1.3l-5.8,2.5l-2.9-1.3l-5.4,2.1l-5.4-2.1l-0.4-3.4l-6.3-2.1l-2.9-3.4l-6.3-0.8l-5.4-4.6l-5.8-1.3l-2.5-2.9l-5.4-0.4l-5.8-2.1l2.5-5l4.6,1.7l2.5-2.1l5,0.8l1.7-3.4l3.8,0.4l5-2.9l4.2,1.7l2.1-2.5l5.4-0.4l1.3,2.9l4.6-0.4l2.9,3.4l4.6-0.8l0.8,2.9l4.2,1.3l1.7-2.9l5.4-0.4l2.5,2.5l4.6,0.4l2.1-3l5.4-0.8l2.9,1.7l4.2-2.1l2.5,2.1l5-0.4l5.4-4.6l3.8,0.8l0.4,3.4l5-1.7l2.9,2.1l3.4-0.4l1.3-2.9l5.4-1.3l1.7,2.5l4.2-0.8l0.4,4.6l-2.1,2.5l0.8,3.8l-2.9,2.5l0.8,5l5,1.3l1.7,3.4l-2.5,2.1l0.4,4.2l-2.1,2.9l-5.4-0.4l-3.4,2.9l-5,0.4l-2.5,3.4l-4.6,0.8l3.4-0.4l5.4,2.9l-0.4,3.8l5.8-0.4l1.7,2.1l5.4-2.9l0.4-3.8l3.4-2.5l5.4,0.4l2.5-2.5l5.8-0.4l2.5,2.5l-2.5,5l5.4-0.4l5,3.8l-0.8,3.4l5.4,0.8l2.5,5.4l5.4-0.4l-5.8-0.4l-2.5-2.5l0.4-3.4l2.5-0.8l-0.4-3.4l3.4,0.4l2.5-3.4l-2.9-2.1l0.8-4.2l-2.9-2.1l-0.8-4.6l-2.5-1.7l0.4-4.2l-5.4-1.3l-0.8-2.9l-4.6-2.5l-0.4-5l1.3-3.4l-0.8-4.6l-5.4-2.9l-5.4,0.4l-0.8-3.4l2.5-2.5l-0.4-5l-3.8-3.4l-2.1-5.4Z'
  },
  PB: {
    abbr: 'PB', name: 'Paraíba',
    path: 'M403.6,127.3l-3.4,0.4l-5,2.9l-4.6,0.4l-2.9,2.5l-5.4-0.4l-2.5-3.8l1.7-4.2l6.3-2.5l5.4,0.4l4.2-0.8l5.8,2.1l0.4,3.4Z'
  },
  PE: {
    abbr: 'PE', name: 'Pernambuco',
    path: 'M354.8,132.3l5,0.4l5.4-2.9l3.4,1.3l5.8-2.5l2.5,0.4l5.4-5.4l0.8-3.8l2.9-0.4l1.7,1.7l5.8-0.4l4.6-3.4l1.7,1.3l0.8,5.4l-0.4,3.4l2.9,2.5l4.6-0.4l5-2.9l3.4-0.4l-0.4,3.4l-2.5,0.4l-4.2,3.8l0.4,5l-2.9,2.1l-5-0.4l-3.4,2.9l-7.1-0.4l-5.8-3.8l-5.8,0.4l-5.4-2.5l-5.8,1.3l-5.4-3.4l-1.7-5.4Z'
  },
  PI: {
    abbr: 'PI', name: 'Piauí',
    path: 'M325.6,91.9l5.8,0.8l2.5,5.4l-0.4,5.4l2.5,2.9l-0.4,5l1.7,5.8l-2.1,5.4l0.4,5l2.5,3.8l5,0.4l-1.3,4.2l-3.4,0.4l0.4-3.4l-2.9-2.1l-2.5,0.4l-5.4,2.9l-5-0.4l-5,5.8l-5.4-2.5l0.4-3.8l-3.8-2.9l0.4-4.6l-2.9-5l0.4-6.3l-2.5-2.9l0.4-4.6l-2.5-5.4l2.1-4.6l-2.9-4.6l0.8-3.8l-2.9-2.1l0.8-4.2l6.3-4.2l3.8-5l6.3,5l4.6-0.4Z'
  },
  PR: {
    abbr: 'PR', name: 'Paraná',
    path: 'M244.6,286.5l5.4,0.4l5.8,5l3.4-0.4l5.8,2.5l6.3-0.4l5.4,3.8l5-0.4l2.5,2.5l-0.4,5.4l-2.9,2.5l0.4,3.8l-6.7,5l-2.9-0.4l-5.4,2.5l-2.5-0.4l-5,2.9l-5.8,0.4l-8.3-3.4l-5.4,0.4l-2.5-2.5l-5.8,0.4l-5.4-5l0.8-4.6l-2.1-2.5l2.1-3.8l5-0.4l5.4-5l5-0.4l5.4-5l-0.4-4.6l3.4-2.1Z'
  },
  RJ: {
    abbr: 'RJ', name: 'Rio de Janeiro',
    path: 'M333.5,266.9l5.4,0.8l5,2.9l5.4,0.8l2.5-2.5l0.8-3.8l3.4,0.8l2.9,4.2l-0.4,3.4l-2.5,2.9l-5.4,0.8l-2.5,2.9l-6.3,0.4l-2.9-1.7l-5.4,0.4l-2.5-2.9l0.8-3.8l-2.1-2.5l3.8-2.5Z'
  },
  RN: {
    abbr: 'RN', name: 'Rio Grande do Norte',
    path: 'M405.7,105.7l-5.8,0.4l-3.4-3.4l-5.8-0.8l-3.4-2.9l-1.3-3.8l2.1-2.5l5-0.4l3.4,0.8l5.8,4.2l3.4,3.4l0.8,3.8Z'
  },
  RO: {
    abbr: 'RO', name: 'Rondônia',
    path: 'M131.5,163.4l5.4,3.8l6.3,0.4l5,5l5-0.4l0.8,4.2l4.6,2.9l1.7,5l-2.5,0.8l-0.8,6.7l-2.9,3l0.8,4.6l-2.9,2.9l-0.4,5l1.7,4.6l-0.4,5l-6.3-0.8l-5.8,0.8l-3.8-0.8l-5.4,2.1l-3-0.4l-0.4-3.8l-2.9-2.1l0.4-2.9l-6.3-3.8l0.4-2.9l-3-4.6l0.8-5l-3.4-4.6l-0.4-5l2.5-3.4l-0.4-4.6l4.6-5.9l0.4-4.6l3.8-3.8l0.4-2.5l5,0.4Z'
  },
  RR: {
    abbr: 'RR', name: 'Roraima',
    path: 'M130.5,25.4l4.2,2.5l0.8,5l4.2,3.4l5.8-2.1l2.9,2.5l5.4-0.8l2.9,4.2l-0.4,5l2.5,3.8l-0.8,5.4l-2.9,2.1l0.8,5l-5.4,5l-5.8,0.8l-5-4.6l-6.3,0.4l-2.5-3.4l-5.4,0.8l-2.9-5.4l-5.8-0.8l-0.8-5l-5-3.4l2.5-5.4l-1.7-5.4l2.9-2.1l0.4-5.8l5.4-2.1l4.2,0.4l0.8,3.4l5.8,0.4Z'
  },
  RS: {
    abbr: 'RS', name: 'Rio Grande do Sul',
    path: 'M245,346.5l5,0.4l5.8-3.8l5-0.4l5.4,2.9l3.4-0.8l5.8,2.1l0.4,5.4l-2.5,5l0.8,3.8l-2.5,5.4l-0.4,5.4l-2.9,2.9l-5,0.4l-2.5,3.8l-5.4,2.1l-2.5,5l-6.3,5.8l-5.4,1.3l-2.9-2.5l-5.8,0.8l-2.5-3.4l0.8-5.4l-2.9-2.5l-0.8-5.8l-4.6-5l0.4-3.8l-2.1-3.4l3.4-3.8l-0.4-5l5.8-2.5l2.5-4.6l5.4-0.4l2.1-3.4Z'
  },
  SC: {
    abbr: 'SC', name: 'Santa Catarina',
    path: 'M265.6,318.2l5.8,0.8l3.4,4.2l5.4-0.4l2.5,2.9l3.8-0.8l5.8,3.4l-0.8,4.6l-2.9,2.5l-5.4,0.4l-5.4-2.9l-5,0.4l-5.8,3.8l-5-0.4l-2.1,3.4l-5.4,0.4l-2.5-3.4l-0.4-5.4l2.9-3.4l-0.4-5l5.8-2.5l5.4,0.4Z'
  },
  SE: {
    abbr: 'SE', name: 'Sergipe',
    path: 'M392.7,166.5l5,3l2.1,5.4l-2.1,3.8l-6.3,0.4l-3.4-3.4l0.4-5l2.5-2.9l1.7-1.3Z'
  },
  SP: {
    abbr: 'SP', name: 'São Paulo',
    path: 'M269.6,247.7l3.4,0.8l0.8,4.6l3.4,3.4l6.3,0.4l2.5,5.4l7.1,0.8l4.6,5.4l6.7-0.4l0.8,3.4l4.6,2.5l-0.8,5l-3.8,2.5l2.1,2.5l-0.8,3.8l2.5,2.9l5.4-0.4l2.9,1.7l-2.5,2.9l-5.4,0.4l-5.8-2.5l-2.5,0.8l-5.8,5.8l-5.8-0.4l-2.9-2.5l-5.8,0.4l-3.4-2.5l-0.4-4.2l-4.6-4.2l2.1-8.3l-0.8-8.3l3-4.6l-0.8-5.4l-1.3-4.2l2.5-5.4Z'
  },
  TO: {
    abbr: 'TO', name: 'Tocantins',
    path: 'M278.5,116.5l5.8-0.4l2.5-2.5l5.4-0.4l2.5,2.5l-0.4,3.8l5,3.8l-0.8,3.4l5.4-0.8l5,0.4l2.9,0.8l5.8-2.9l5,0.4l2.5-2.1l6.7,1.3l2.5-2.5l5.8-0.4l2.5,5.4l5.4-0.8l0.8,3.4l2.9,5l-0.4,6.3l-1.3,4.2l3.8,2.9l-0.4,3.8l-4.6,2.9l-2.1,5.4l2.5,3.8l-0.8,5.4l-3.8,0.4l-5.8-5l-5.4-0.8l-2.1,3.4l-5-3.4l0.4-4.6l-4.6-5.4l0.4-4.6l-3.8-3l0.8-5l-3.8-1.7l-3.4,1.3l-5-2.5l-0.8-3.4l-6.3,0.4l-5.4-2.9l-3.4,0.4l0.4-3.8l-2.5-2.5l-5.8,0.4l-5-3.8l0.4-3.8l2.5-5Z'
  },
};

export function BrazilMap({ clientsByState, totalClients }: BrazilMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const stateData = useMemo(() => {
    const data: Record<string, StateData> = {};
    Object.keys(BRAZIL_STATES).forEach((abbr) => {
      const count = clientsByState[abbr] || 0;
      data[abbr] = {
        count,
        percentage: totalClients > 0 ? (count / totalClients) * 100 : 0,
      };
    });
    return data;
  }, [clientsByState, totalClients]);

  const maxCount = useMemo(() => Math.max(...Object.values(clientsByState), 1), [clientsByState]);

  const getStateColor = (abbr: string) => {
    const data = stateData[abbr];
    if (!data || data.count === 0) return 'hsl(210, 60%, 35%)'; // Blue base for empty states
    
    const intensity = data.count / maxCount;
    
    // Blue gradient from light to dark (like the reference image)
    if (intensity > 0.8) return 'hsl(220, 70%, 35%)'; // Darkest blue
    if (intensity > 0.6) return 'hsl(215, 65%, 45%)';
    if (intensity > 0.4) return 'hsl(210, 60%, 55%)';
    if (intensity > 0.2) return 'hsl(205, 55%, 65%)';
    return 'hsl(200, 50%, 72%)'; // Lightest blue
  };

  const topStates = useMemo(() => {
    return Object.entries(clientsByState)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [clientsByState]);

  const totalWithState = useMemo(() => {
    return Object.values(clientsByState).reduce((a, b) => a + b, 0);
  }, [clientsByState]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Distribuição por Estado
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-4">
          {/* Map */}
          <div className="flex-1 relative">
            <TooltipProvider delayDuration={0}>
              <svg
                viewBox="0 0 450 420"
                className="w-full h-auto max-h-[280px]"
              >
                <defs>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                
                {Object.entries(BRAZIL_STATES).map(([abbr, state]) => {
                  const data = stateData[abbr];
                  const isHovered = hoveredState === abbr;
                  
                  return (
                    <Tooltip key={abbr}>
                      <TooltipTrigger asChild>
                        <path
                          d={state.path}
                          fill={getStateColor(abbr)}
                          stroke="hsl(210, 30%, 85%)"
                          strokeWidth={isHovered ? 2 : 0.8}
                          filter={isHovered ? 'url(#glow)' : undefined}
                          onMouseEnter={() => setHoveredState(abbr)}
                          onMouseLeave={() => setHoveredState(null)}
                          className="cursor-pointer transition-all duration-200"
                          style={{
                            transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                            transformOrigin: 'center',
                            transformBox: 'fill-box',
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent 
                        side="top" 
                        className="bg-popover/95 backdrop-blur-sm border-border shadow-xl px-3 py-2"
                      >
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">{state.name}</p>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-bold text-primary">{data.count}</span>
                            <span className="text-sm text-muted-foreground">
                              cliente{data.count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {data.count > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {data.percentage.toFixed(1)}% do total
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </svg>
            </TooltipProvider>
          </div>

          {/* Legend */}
          <div className="w-32 space-y-3 py-2">
            <div className="space-y-1">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Top Estados
              </h4>
              {topStates.length === 0 ? (
                <p className="text-xs text-muted-foreground/70 italic">
                  Sem dados
                </p>
              ) : (
                <div className="space-y-1">
                  {topStates.map(([abbr, count]) => {
                    const percentage = totalWithState > 0 ? ((count / totalWithState) * 100).toFixed(0) : 0;
                    return (
                      <div
                        key={abbr}
                        className="flex items-center justify-between text-xs group hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors cursor-pointer"
                        onMouseEnter={() => setHoveredState(abbr)}
                        onMouseLeave={() => setHoveredState(null)}
                      >
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getStateColor(abbr) }}
                          />
                          <span className="font-medium text-foreground">
                            {abbr}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-foreground">{count}</span>
                          <span className="text-[10px] text-muted-foreground">({percentage}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Color Scale */}
            {topStates.length > 0 && (
              <div className="pt-2 border-t border-border/40">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Menos</span>
                  <span>Mais</span>
                </div>
                <div 
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{
                    background: 'linear-gradient(to right, hsl(200, 50%, 72%), hsl(205, 55%, 65%), hsl(210, 60%, 55%), hsl(215, 65%, 45%), hsl(220, 70%, 35%))',
                  }}
                />
              </div>
            )}

            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Total</span>
                <span className="text-base font-bold text-foreground">{totalClients}</span>
              </div>
              {totalWithState > 0 && totalWithState < totalClients && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {totalClients - totalWithState} sem estado
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
