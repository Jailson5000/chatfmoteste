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

// Real geographic SVG paths for Brazilian states (from IBGE geographic data)
const BRAZIL_STATES: Record<string, { path: string; name: string; abbr: string }> = {
  AC: {
    abbr: 'AC', name: 'Acre',
    path: 'M73.9,209.6l-1.3,0.8l-2.2-0.5l-0.5,1.2l-3.5,0.4l-1.7,1.5l0.2,1.5l-1.5,0.7l-0.8,2.2l-2.5,1.2l-0.5,2.2l-2.1,1.9l0.4,1.4l-0.8,1.9l1.3,2.1l-0.6,2.5l0.8,1.5l-1.1,3.1l1.7,1.3l-0.5,2.4l1.3,2.8l3.7,1.3l0.6,1.4l2.1,0.6l1.7-1.5l2.6,0.3l1-1.5l1.9,0.1l3.1-2.1l2-0.1l1.5-1.4l1.9,0.8l2.5-0.8l2.3,0.6l2.5-1.1l3.1,1l1.1-0.7l-0.5-1.4l1.5-0.7l-0.1-2.2l-1.8-1.1l0.9-1.7l-1.3-1.9l1.4-1.8l-0.2-2.2l-2.6-0.2l-0.5-1.4l-2.5,0.1l-0.6-1.4l-1.8,0.5l-1.9-1.6l-3.2,0.3l-0.8-1.6l-2.6-0.6l-0.9-2.6l-2.9-1.1l-0.5-1.7Z'
  },
  AL: {
    abbr: 'AL', name: 'Alagoas',
    path: 'M461.4,187.2l-3.9,1.3l-4.4,3.4l-3.6,4.4l0.2,2.5l3.9,0.5l2.3-0.7l3.7-2.9l2.6-0.5l2.3-2.6l-0.1-2.4l-1.2-1.5Z'
  },
  AP: {
    abbr: 'AP', name: 'Amapá',
    path: 'M276.1,65l-0.6,2.2l-3.9,0l-2.3,1.5l-1.8-0.5l-1.2,2.2l0.4,3.6l-1.9,1.1l0.6,1.5l-0.3,3.3l1.5,3.3l2.5,2l1.1,3.7l2.9,0.7l1.4,2.9l-0.3,2.2l1.3,1.5l3.3-0.5l2.7,0.6l0.5-4.3l1.4-2l-0.7-1.5l0.9-0.7l-1.5-2.6l0.7-2l-0.8-1.1l0.1-3.6l-1.3-1.3l0.2-2.7l1.3-3.5l-0.3-2.7l-2.5-1.7l-2.7,0.4Z'
  },
  AM: {
    abbr: 'AM', name: 'Amazonas',
    path: 'M73.9,209.6l1.3-3.6l2.2-0.2l1.9-2.9l3.4-1.9l0.9-3l3.5-0.1l2.8-1.9l0.9-2.4l2.7-0.1l1.7-2.9l5-2.2l1.9,0.7l2.2-2.2l4.6,0.2l2.9-2.2l-0.9-2.7l1.6-0.4l-0.5-2.9l1.9-1.5l0.9,2.9l1.7-2l4.7-1l1.1-2.9l3.9-0.2l1.9-1.9l-0.5-2.2l3-1.4l-1.5-2.4l1.7-3.4l-0.5-3.4l1.5-0.9l-0.2-2.2l3.2-2.4l3.4,0.5l0.7-1.5l3.5,0.9l3-2.2l0.9,1.5l2.9-0.2l1.7,2.7l4.4,0.2l1.2-2l2.4,0.5l0.9-1.9l6.4,0.2l2.4-2.2l1.5,0.7l2.4-1.5l0.9,0.9l2.9-2l4.9,0.5l1.5-1.4l3.4,0.5l0.9,3.4l4.2,0.2l2.7,2.4l-0.5,1.4l2,1.4l2.9-0.5l0.9,1.9l2.9,0.7l-0.5,2.7l2.4,1.2l0.5,3.9l2.9,3.7l-0.5,1.9l1.7,2.2l-0.7,2l2.7,0.9l-0.2,2.4l1.7,1.4l-0.5,1.7l3.2,3.9l-0.7,3.2l1,1.5l-0.5,3.9l0.5,1.5l-1.3,1.3l0.9,1.7l-0.2,2.9l1.7,0.5l0.2,1.9l-1.2,2.4l0.7,3.6l3.4,0.5l0,2.1l-26.3,0.2l-0.5,4.6l-1.5,2.4l0.2,3.9l-2.2,0.7l-0.2,6.1l-1.2,6.6l-1.9,0.5l-0.2,2.4l-1.9,1.9l-0.7,4.6l-2.9,4.9l-0.2,1.9l-3.2,1.2l-3.2-1.2l-1.9-3.7l-2.4-0.9l-1.2-2.2l-3-0.5l-2.4,0.7l-2.4-3.2l-2.9-0.7l-0.7-1.4l-2.9,0.7l-1.4-2.2l-1.7,0.9l-2.4-0.2l0.2-3.2l-2.7-0.5l-1.2,0.9l-1.7-1.5l-2.7,1.7l-1.9-0.2l-1.2,2l-3.2-0.7l-0.9-1.4l-1.9,1.7l-2.2-2.2l-3.2,2.2l-1.5-2.4l-3.4,2l-3.7-1.2l0.2-2.9l-3.4-1.5l-0.2-1.5l-2.2-0.7l0.9-1.7l-1.5-1.9l0.5-1.9l-3.2-1.7l-1.5,0.7l-0.2-2.9l-1.9,0.2l-0.5-2.4l-3.7-0.7l-0.5-1.7l-2.7,0.2l0.5,1.7l2.9,1.1l0.9,2.6l2.6,0.6l0.8,1.6l3.2-0.3l1.9,1.6l1.8-0.5l0.6,1.4l2.5-0.1l0.5,1.4l2.6,0.2l0.2,2.2l-1.4,1.8l1.3,1.9l-0.9,1.7l1.8,1.1l0.1,2.2l-1.5,0.7l0.5,1.4l-1.1,0.7l-3.1-1l-2.5,1.1l-2.3-0.6l-2.5,0.8l-1.9-0.8l-1.5,1.4l-2,0.1l-3.1,2.1l-1.9-0.1l-1,1.5l-2.6-0.3l-1.7,1.5l-2.1-0.6l-0.6-1.4l-3.7-1.3l-1.3-2.8l0.5-2.4l-1.7-1.3l1.1-3.1l-0.8-1.5l0.6-2.5l-1.3-2.1l0.8-1.9l-0.4-1.4l2.1-1.9l0.5-2.2l2.5-1.2l0.8-2.2l1.5-0.7l-0.2-1.5l1.7-1.5l3.5-0.4l0.5-1.2l2.2,0.5Z'
  },
  BA: {
    abbr: 'BA', name: 'Bahia',
    path: 'M400,151.2l2.9,2.7l5.2,0.2l2.4,2l5.7,1l4.4,4.2l5.5,1.7l0.5,2.7l2.4,0.5l0.7,2.4l-1,1.9l2.4,4.4l-0.7,5.7l1.9,5.9l-0.5,3.4l1.5,1.5l-0.5,2.2l1,2.4l-0.5,3.4l2.2,4.7l-0.5,1.9l2.4,2.4l0.5,2.4l-0.5,5.4l-2.7,1.9l-0.2,3.4l-1.7,4.4l-4.4,4.4l0.5,2.9l-3.4,0.2l-2.4,4.4l0.5,3l-7.4,0.2l-5.9,1.5l-4.6-0.2l-6.1,1l-3,4.9l-5.6,2.4l-3.7,0.2l0.2-5.2l-4.4-0.7l0.2-3l-1.5-2.9l1.5-1.2l-1.2-4.4l1.2-1.5l-1.5-2.4l0.5-5.2l-1.7-3l0.2-2l-2.4-3.2l0.2-5.4l-1.9-1.7l0.2-4.4l-4.2-5.4l1.2-1.7l0.2-5.4l-1.2-1.4l0.5-4.7l-1.2-2.4l4.4-0.7l1-3.9l0.2-8.9l3.4-1l2.4-3.2l2.4,0.2l2.2-2.7l2.4-0.2l2.7-3.2l4.4-1l0.7,0.7l3.2-1.4l2.2,1.4l1.9-1.5Z'
  },
  CE: {
    abbr: 'CE', name: 'Ceará',
    path: 'M420.2,116.8l3.7,0.7l3.4,3l2.4,0.5l2.2,2.2l5.7,2.4l2.4,3.2l-0.7,5.4l-2.9,4.2l-2.4,0.2l-0.5,1.7l-3.7,3l-0.2,2.7l-3.7,3.4l0.5,3.9l-1.7,0.7l-1.5-0.7l-5.2,0.2l-6.9-2.9l-2.4,0.5l-0.2-3.4l-1.5-1l0.2-1.7l1.9-2.2l0.2-5.7l-2.4-0.9l-1.9-4.2l0.2-3l1.9-2.4l0.2-4.2l3.2-2l2.9,0.7l2.7-2.2l3.7,0.5Z'
  },
  DF: {
    abbr: 'DF', name: 'Distrito Federal',
    path: 'M323.4,255.4l2.5,0.1l2.2,2.2l0.1,2.4l-2.2,2.5l-3.5,0.1l-1.5-2l0.3-3.2l2.2-2.2Z'
  },
  ES: {
    abbr: 'ES', name: 'Espírito Santo',
    path: 'M414.2,284.2l-3,3.7l-0.7,3.4l0.7,5.4l2,4.7l4.4,4.4l4.6,0.2l3.2-1.9l0.5-3l-1.9-3l0.2-4.7l-1-3.4l-2.4-1.7l-1.2-4.2l-3.4,0.7Z'
  },
  GO: {
    abbr: 'GO', name: 'Goiás',
    path: 'M295.4,220.8l3.9,0.2l4.4,4.4l3.2-0.5l1.9,0.7l3.4-2.7l3.7,0.2l4.2,3l4.9,0.5l4.7,4.2l0.2,1.9l2.2,1.7l-0.5,3.2l1.7,3l0.2,4.9l1.2,0.7l-1.2,3l0.7,2.4l-0.5,4.4l-3.4,5.4l-0.2,2.2l-2,2.2l0.2,4.4l2.4,2.9l-0.5,7.4l-3.9,0.5l-3.9-0.5l-1.2-1.4l-3.7,0.5l-6.9-1l0.5-4.2l-5.4-0.5l-0.7-2.7l-5.7-3l-3.2,1l-3.4-1.7l-1.5-3.4l-3.4-1l-1-3.4l-2.2-1.2l1.5-9.9l-1.9-2.4l1-4.2l-1.2-5.4l0.5-5.4l2.7-1.7l-1-2.7l1.9-3.2l0.2-3l3-0.7l3.9,1.9Z'
  },
  MA: {
    abbr: 'MA', name: 'Maranhão',
    path: 'M341.9,112.2l-3.7,0.5l-1.2,2.4l-2.2,0.2l-3.7-3.7l-5.9,0.2l-3.2,2.9l-1.9-1.7l-0.2-3.7l-2.2-0.5l-4.2,2.7l-1.5-1.2l-3.2,0.7l-1.9,2.4l-2.9-1.2l-5.7,0.7l-1.9-1l0.2-5.4l-2-1.5l0.2-3.4l-1.9-2.2l0.2-3.2l-1.9-0.7l-0.2-3.4l-3.4-2l-2.4,2.4l-1.5,4.4l0.5,4.2l-5.2,0.7l0,4.9l-2.4-0.7l-0.7,3.2l1.9,2l-1.7,2.4l1.2,1.9l-1,3.4l1.5,5.4l-1.7,2.7l0.7,2l2.4,1.5l0.5,1.9l2.9,1.5l0.7,3.4l2.4,0.7l0.5,2l2.7,2l0.2,2.7l3.7,2.4l4.7,5.4l4.4,2.2l0.2,1.9l-2,2.7l5.9,0.5l1.7-2.7l4.2,0.5l2.2-2l1.9,0.7l3-2.4l0.7-2.4l4.7-2.7l2.4,0.7l2.7-1l3.7,0.5l-0.5-3.4l1.4-4.7l-1.2-3l1.7-4.4l-1.5-1.7l0.5-1.9l-1.9-5.2l1.4-5.4l-0.7-2.9l2.2-2l0.2-2.7l2.4-1.7l3.4,0.5l0.2,1.5Z'
  },
  MT: {
    abbr: 'MT', name: 'Mato Grosso',
    path: 'M221.9,174.8l29.3,2l25.4,1.7l-0.7,25.9l3.9,4.2l1.2,4.9l2.7,2.9l0.2,4.9l-3.9-1.9l-3,0.7l-0.2,3l-1.9,3.2l1,2.7l-2.7,1.7l-0.5,5.4l1.2,5.4l-1,4.2l1.9,2.4l-1.5,9.9l-6.4-4.7l-3-0.2l-1.9-2.7l-4.9-0.5l-9.9-6.4l-25.4-1.2l-1-21.2l-0.5-2.7l1.2-2.2l-2-1.9l0.5-3l-1.5-1.4l1.5-5.9l-0.5-2.7l1-1.5l-0.7-3.2l3.2-4.4l0.2-3.4l-3.2-4.4l1-3.9Z'
  },
  MS: {
    abbr: 'MS', name: 'Mato Grosso do Sul',
    path: 'M285.5,276l-0.7,2.7l-2.7,0.5l-0.2,2.7l-3.7,3.7l-0.2,3.4l-2.9,2.4l1.5,1.9l-1.2,4.4l0.7,2l-1,2.2l1.2,2.2l-0.5,1.9l0.5,2.4l-3.7,5.9l0.7,1.7l-3.4,3l-2,3.7l-5.4,2.2l-3.7,4.7l-2.9,0.2l-4.2-2.7l-2.2,0.7l-2.2-2.7l-3.2,2.2l-1.9,4.7l-4.4-0.5l-3.7-2.4l-1.9,0.2l-1.5-2.4l0.2-2.4l-2.9-3l0.5-2.9l-1.5-2.7l1.2-1l-0.2-2.2l1.9-0.7l0.7-2.9l2.9-2.4l-0.7-1.7l2-2l0.7-4.2l4.4-4.9l1.5-4.4l0.2-3.7l3.4-1.9l-0.7-1.7l2.2-0.2l6.4,2l2.4-1.5l4.2,0.5l2.2-2.9l5.9,0.7l5.4,3.4l3.4,1l1.5,3.4l3.4,1.7l3.2-1l5.7,3Z'
  },
  MG: {
    abbr: 'MG', name: 'Minas Gerais',
    path: 'M328.4,263.4l3.7-0.5l1.2,1.4l3.9,0.5l3.9-0.5l0.5-7.4l-2.4-2.9l-0.2-4.4l2-2.2l0.2-2.2l3.4-5.4l0.5-4.4l-0.7-2.4l1.2-3l-1.2-0.7l-0.2-4.9l-1.7-3l0.5-3.2l-2.2-1.7l-0.2-1.9l4.4-0.5l1.7,0.7l5.7-4.2l0.7-2.4l3.4,1.2l3.2-2.2l4.4,1.5l3.2,4.4l6.6,3l1.9-1l3.2,1.7l4.4-1l4.9,1l1.5,2l-0.5,2.9l3.2,1.9l0.2,2.9l-0.5,2.4l2.7,3.7l0.2,3.7l2.7,1.2l3.9,3.9l1.2,2.9l4.4,2.4l2.4-0.5l2.7,1.9l-0.2,2.7l-3.2,0.2l-2.4,1.5l-1.9,3l0.2,2.9l1.7,1.5l-1,3.7l-2.2,0.5l-0.2,2.4l-1.9,1.2l0.5,2.7l-4.4,1.7l-2.7,2.4l0.7,2l-1.4,2.4l-3.7,1.7l1,2.2l-4.2,3.4l-4.4,0.5l-1.5,2.4l-2.9,0.2l-2.7-2.4l-3.9,2.9l-6.1,1l-1.7-3.9l-2.2-1.5l0.5-4.2l-2-1.4l0.5-1.2l-1.9-1.2l-0.5-2.7l-4.4-2.7l-1.5,0.7l-0.5-2.4l-3.9-1.7l-3.2,3.7l-5.7-4l-0.2-2l-5.2,0l-1.5-1.5l0.5-3.9l-1.9-2.4Z'
  },
  PA: {
    abbr: 'PA', name: 'Pará',
    path: 'M226.1,86.2l3.2,0.2l2.9,3.7l3.7,0.5l1,2.2l5.4,0.7l3.2-2l3.2,0.5l1.4-2.4l3.7,0.2l1.2-1.5l4.4,0.5l0.5,2.7l2.9-1.2l5.2,0.7l3.7-1.7l-0.2-1.7l2.7-0.5l0.2,1.4l2.4-1.7l3.4,0.5l2.2,2.9l2.4,0.2l3.2-1.7l1.7,3.4l2.9,0l0.2-4.7l1.7-1l0.2-3.9l3.9,0.5l2.4-1.2l0.5-1.4l3.4,2.4l2.4-0.5l2.7,1.7l-0.5,1.4l1.9,0.5l1.9-1.7l2.7,1.5l1.5-1.2l3.4,0.2l0.5,2.2l3.4,0.7l1.9-2.2l0.5-2.9l3.4-0.2l0.2-1.5l-3.4-0.5l-2.4,1.7l-0.2-2.7l-2.9-0.2l-1.2-2l-3.7,0.5l-0.5-2l1.5-1.5l-2.2-3.4l-2.4-0.5l-0.2-4.2l-3.2-3.4l1.2-2.4l-1.7-1.2l0.5-1.9l-2.2-2.4l4.2-0.5l1-2.4l-1.9-1.7l1.9-2.4l-0.2-2.4l-2.9-0.5l-3.4,0.5l-2.4,2.2l-2.7-0.5l-0.2-1.9l-2.4,0l-0.5-2.2l2.7-1l2.4-2.2l-0.5-2.9l0.5-4.9l2.4-2.2l-1.2-3.9l4.4-4.2l0-2.7l-1.9-3.4l-5.7,0.2l-2-3l-3.9,1l-1.9,2.4l-1.9-1.5l-3.2,0.5l-0.2-1.9l-2.7,1.9l-3.4-3.9l-3.7,0.5l-4.9-3.2l-2.4,0.7l-2.4-1.2l-2.9,1l0,3l1.7,1.4l-1.7,0.7l0.7,2.9l-1.5,1.5l0.2,2.9l-3.2,1.7l0.7,1.4l-3.9,1.7l0.7,2.4l-1.9,0.7l0.2,2.7l-1.7,0.7l-1.5,3.4l-2.4-0.5l-0.7,1.9l-2.7-0.2l-1.7,1.4l-2.4-1.2l-1.7,2l-3.4-2.7l-0.7,1.2l-2.9-0.7l-1.7,1l-0.7-2.2l-2.4-0.5l0-2.2l-2.2-0.5l-0.2-1.9l-3.4-3.7l-0.5-3.9l-2.4-1.2l0.5-2.7l-2.9-0.7l-0.9-1.9l-2.9,0.5l-2-1.4l0.5-1.4l-2.7-2.4l-4.2-0.2l-0.9-3.4l-3.4-0.5l-1.5,1.4l-4.9-0.5l-2.9,2l-0.9-0.9l-2.4,1.5l-1.5-0.7l-2.4,2.2l-6.4-0.2l-0.9,1.9l-2.4-0.5l-1.2,2l-4.4-0.2l-1.7-2.7l-2.9,0.2l-0.9-1.5l-3,2.2l-3.5-0.9l-0.7,1.5l-3.4-0.5l-3.2,2.4l0.2,2.2l-1.5,0.9l0.5,3.4l-1.7,3.4l1.5,2.4l-3,1.4l0.5,2.2l-1.9,1.9l-3.9,0.2l-1.1,2.9l-4.7,1l-1.7,2l-0.9-2.9l-1.9,1.5l0.5,2.9l-1.6,0.4l0.9,2.7l-2.9,2.2l-4.6-0.2l-2.2,2.2l-1.9-0.7l-5,2.2l-1.7,2.9l-2.7,0.1l-0.9,2.4l-2.8,1.9l-3.5,0.1l-0.9,3l-3.4,1.9l-1.9,2.9l-2.2,0.2l-1.3,3.6l2.1,0.7l4.6,1.7l2.5-2.1l5,0.8l1.7-3.4l3.8,0.4l5-2.9l4.2,1.7l2.1-2.5l5.4-0.4l1.3,2.9l4.6-0.4l2.9,3.4l4.6-0.8l0.8,2.9l4.2,1.3l1.7-2.9l5.4-0.4l2.5,2.5l4.6,0.4l2.1-3l5.4-0.8l2.9,1.7l4.2-2.1l2.5,2.1l5-0.4l5.4-4.6l3.8,0.8l0.4,3.4l5-1.7l2.9,2.1l3.4-0.4l1.3-2.9l5.4-1.3l1.7,2.5l4.2-0.8l0.4,4.6l2.1,2.5l-0.8,3.8l2.9,2.5l-0.8,5l5,1.3l1.7,3.4l-2.5,2.1l0.4,4.2l-2.1,2.9l-5.4-0.4l-3.4,2.9l-5,0.4l-2.5,3.4l-4.6,0.8l-2.1-2.1l-6.7,0.4l-2.1-2.1l-5.4-0.8l-0.4-2.5l-4.6-0.8l-4.2,2.5l-2.5-2.1l-4.6,0.8l-1.3-2.5l-3.4-0.4l-5.4,3.8l-2.5-0.8l-0.8-4.2l-3.4-1.3l-5.8,2.5l-2.9-1.3l-5.4,2.1l-5.4-2.1l-0.4-3.4l-6.3-2.1l-2.9-3.4l-6.3-0.8l-5.4-4.6l-5.8-1.3l-2.5-2.9l-5.4-0.4l-5.8-2.1l2.2,4.2l-1.5,2.9l2.4,2l0.2,4.4l-1.9,2.4l0.5,3l-2.2,5.4l1.2,5.2l-1.2,2.9l0.5,3.2l3.2,3.2l1.9-0.5l2.4,1.9l3.2-0.5l1.5,1.7l-0.2,3.7l2.2,1.7l-0.5,2l2.7,0.7l0.7,3l2.9,1l0.2,5.7l5.4,5.4l2.9-0.2l1.2,1.5l-0.2,2.4l2.4,1l-0.2,2.9l1.9,1.5l3.2,0.2l2,1.7l3.4-0.2l2.7,2l0.5,2.4l2.7,1.9l3.7,0l2.4,2.4l26.3-0.2l0-2.1l-3.4-0.5l-0.7-3.6l1.2-2.4l-0.2-1.9l-1.7-0.5l0.2-2.9l-0.9-1.7l1.3-1.3l-0.5-1.5l0.5-3.9l-1-1.5l0.7-3.2l-3.2-3.9l0.5-1.7l-1.7-1.4l0.2-2.4l-2.7-0.9l0.7-2l-1.7-2.2l0.5-1.9l-2.9-3.7l-0.5-3.9Z'
  },
  PB: {
    abbr: 'PB', name: 'Paraíba',
    path: 'M461.4,149.7l-3.9,0.7l-1.7,2.2l-2.4-0.5l-2.7,1.7l-6.1-0.5l-3.4,0.5l-0.7-1l-2.9,0.5l-4.7-2.4l-2.7,0.7l-1.9-1.2l-3.2,0.5l-1.2-2.2l3.9-1.2l6.9,2.9l5.2-0.2l1.5,0.7l1.7-0.7l-0.5-3.9l3.7-3.4l0.2-2.7l3.7-3l0.5-1.7l2.4-0.2l2.9-4.2l0.7-5.4l5.7,3.4l4.2,3.4l-0.2,3.7l-3.4,5.2l-3.7,5.7l0,3Z'
  },
  PE: {
    abbr: 'PE', name: 'Pernambuco',
    path: 'M399.7,151.5l0.2,3.4l-2.9,2.7l-5.2-0.2l-2.9-2.7l-1.9,1.5l-2.2-1.4l-3.2,1.4l-0.7-0.7l-4.4,1l-2.7,3.2l-2.4,0.2l-2.2,2.7l-2.4-0.2l-2.4,3.2l-3.4,1l-0.2,8.9l-1,3.9l-4.4,0.7l-0.5-2.4l-2.7,0.5l-0.7-1.9l-4.2-0.5l-0.2-1.4l-1.9,0.5l-0.5-3.4l1.7-0.7l0.7-3l2.2,0.2l0.7-2.4l-1.7-0.5l1.7-1.7l-1.2-1l1.2-1.9l-1.2-1.4l0.5-1.9l-1.2-1.7l0.5-1.4l-1.9-1.2l3.2-0.5l1.9,1.2l2.7-0.7l4.7,2.4l2.9-0.5l0.7,1l3.4-0.5l6.1,0.5l2.7-1.7l2.4,0.5l1.7-2.2l3.9-0.7l0-3l3.7-5.7l3.4-5.2l0.2-3.7l5.4,2.4l7.9,3.9l2.4,2.4l-2.4,3.2l-0.7,3.9l1.5,2.7l-0.5,3.2Z'
  },
  PI: {
    abbr: 'PI', name: 'Piauí',
    path: 'M373.4,118.5l0.2,4.2l-1.9,2.4l-0.2,3l1.9,4.2l2.4,0.9l-0.2,5.7l-1.9,2.2l-0.2,1.7l1.5,1l0.2,3.4l-1,2.7l-0.7,5.4l1.2,1.7l-0.5,1.4l1.2,1.7l-0.5,1.9l1.2,1.4l-1.2,1.9l1.2,1l-1.7,1.7l1.7,0.5l-0.7,2.4l-2.2-0.2l-0.7,3l-1.7,0.7l-0.2-2.9l-3.4-0.5l-2.2,0.5l-2.4-1.7l-0.7-2.4l-2.4,0.2l-3.7,2.4l-2.9,0l-2.2,1.7l-4.4-0.5l-3.4,1l-2.4-2.2l0.5-1.9l-1.2-3.2l0.7-1l-3.7-2.4l-0.2-2.7l-2.7-2l-0.5-2l-2.4-0.7l-0.7-3.4l-2.9-1.5l-0.5-1.9l-2.4-1.5l-0.7-2l1.7-2.7l-1.5-5.4l1-3.4l-1.2-1.9l1.7-2.4l-1.9-2l0.7-3.2l2.4,0.7l0-4.9l5.2-0.7l-0.5-4.2l1.5-4.4l2.4-2.4l3.4,2l0.2,3.4l1.9,0.7l-0.2,3.2l1.9,2.2l-0.2,3.4l2,1.5l-0.2,5.4l1.9,1l5.7-0.7l2.9,1.2l1.9-2.4l3.2-0.7l1.5,1.2l4.2-2.7l2.2,0.5l0.2,3.7l1.9,1.7l3.2-2.9l5.9-0.2l3.7,3.7l2.2-0.2l1.2-2.4Z'
  },
  PR: {
    abbr: 'PR', name: 'Paraná',
    path: 'M267.6,337.1l4.2,3.9l6.1,3.7l1,2.9l4.7,2.2l3.9,0l1.2,1.4l5.4,0.5l1.2,1l3.9,0.2l2.4,2l1.2,5.4l-0.7,3.4l0.7,3.2l-0.5,4.4l2.2,3.9l-0.5,1.4l-3.4,1.5l-4.9,0.2l-1,1.9l-7.9,3l-2.4-0.5l-2.9,0.7l-3.2,2.4l-3.2-0.2l-5.7,3.4l-5.9,1.2l-1.5-3l-0.5-3.9l-2.7-0.7l-2.4,0.7l-0.5-1.9l-3.4-2.2l-0.5-2.2l-3.9-3.4l0.2-5.2l-2.7-2.2l1.2-5.2l-0.5-5.4l2.2-3l-0.5-1.2l3.7-2.9l6.6-1.4l1.7-2l3.2,0.7l2.2-1.7l1.9,0.5Z'
  },
  RJ: {
    abbr: 'RJ', name: 'Rio de Janeiro',
    path: 'M378.9,319.7l2.9,1.2l5.4,4.7l6.6,2.2l3.7-0.5l5.2,0.5l2,1.7l-1.2,3l-0.7,4.4l-2.4,0.7l-6.1-0.7l-6.4-2.9l-3.4,0.5l-1.7-1.5l-3.4,0.5l-3.2-1.5l-3.9,0.7l-3.2-0.5l-2,1.2l-3.2-1l-0.5-1.9l2.7-2l1.5-2.4l4.9-1.7l3.2,0.5l2.9-1.5l1.5-2.4Z'
  },
  RN: {
    abbr: 'RN', name: 'Rio Grande do Norte',
    path: 'M461.6,132.6l0.2,4.4l-4.2,4.2l-3.2,5.9l-2.4-0.7l-6.4,1l-2.2-1l-1.9,0.7l0.2-3l-0.5-3.2l0.7-3.9l2.4-3.2l-2.4-2.4l5.9-0.5l4.4,1.5l3.4-0.2l5.9,0.2Z'
  },
  RO: {
    abbr: 'RO', name: 'Rondônia',
    path: 'M166.7,211.3l-0.2,2.4l-1.5,2.2l0.7,1.9l-2.4,3.7l0.7,2.4l-1.9,6.1l0.2,3.4l-2.2,3.7l0.5,3l1.5,1.4l-0.7,1.5l1.5,2.2l-1.5,0.7l-4.2-0.5l-6.4,2.4l-3.2-0.5l-3.4,1.2l-0.2-1l-3.4,0.2l-2.4-3.2l-2.7,1l-1.9-4.2l-2.7-0.7l-1.9-3.2l0.5-4.2l-1.5-3.4l0.7-3.4l-2.4-2.4l1-3.4l-1.5-2.9l0.7-2.2l-0.7-4.2l1.9-0.5l-0.7-2.4l3.9-3l0.7-1.9l2.9,0.2l0.5-2.4l2.9,0.5l0.5-2.9l-0.5-3.9l3.4,0.7l0.2-5.9l2.4-1l0.7-2.4l3.2,1.2l3.2-1.2l0.2-1.9l2.9-4.9l0.7-4.6l1.9-1.9l0.2-2.4l1.9-0.5l1.2-6.6l0.2-6.1l2.2-0.7l-0.2-3.9l1.5-2.4l0.5-4.6l16.6,1l0.5,2.7l-1.5,5.9l1.5,1.4l-0.5,3l2,1.9l-1.2,2.2l0.5,2.7l1,21.2l-7.2-0.5l-2.7,1.5l-1.5,3.2l-3.4,1.5l-0.7,1.7l-2.4-0.2l-1.2,3Z'
  },
  RR: {
    abbr: 'RR', name: 'Roraima',
    path: 'M155.7,20.4l2.4,3l0.2,4.4l3.2,4.7l5.2-1.9l2.9,2.4l4.9-0.7l2.4,4.2l-0.2,5.4l2.4,4.7l-1.2,5.9l-2.2,0.7l-0.5,3l-5.2,4.7l-1,0.2l-2.4,0.2l-5.9,1l-4.7-4.9l-4.9,0.7l-2.7-4.4l-5.4,0.7l-2.4-6.4l-5.2-0.2l-0.7-5.4l-5.7-4.4l2.4-4.9l-1.7-5.4l2.7-2.2l0.5-6.2l4.9-2.4l3.4,0.7l1.5,4.4l5.2-0.2l3.2-1.2l3.4,3.7Z'
  },
  RS: {
    abbr: 'RS', name: 'Rio Grande do Sul',
    path: 'M262.1,391.4l1.5,2.4l-0.2,4.9l-0.7,1.9l0.5,4.4l-2.4,2.4l-0.7,2.2l0.5,4.4l-1.2,4.7l0.2,2.9l-1.2,5.9l-2.4,1.7l-0.7,3.2l-2.7,0.7l-2.7,4.7l-4.4,2.2l-4.4,0.5l-2.4,2.9l-5.2-0.2l-6.6-3.4l-3.4,0.7l-3.4-1.7l-2.7,0.7l-0.5-2.4l-2.9-0.5l-0.5-2.2l2.4-0.2l1.2-2.4l-0.7-2.4l2.7-3.2l0.5-4.2l2.2-3.4l0-3l-2.4-1.7l-0.7-3.7l0.7-2.9l-0.7-3.7l0.2-3.4l2.2-2.4l0.7-4.2l2.4-3.9l5.4-3.9l5.4-1.5l6.1-0.7l3.2,1l1.9-0.5l2.4,4.7l5.4,1.9l0.7,1.7l4.9,1.4l3.9-0.5Z'
  },
  SC: {
    abbr: 'SC', name: 'Santa Catarina',
    path: 'M300.8,378.6l0.5,3.4l-3.7,4.7l-1.2,5.4l-2.4,1l-3.2-0.2l-6.1,0.7l-5.4,1.5l-5.4,3.9l-2.4,3.9l-0.7,4.2l-1.7-0.2l-3.9,0.5l-4.9-1.4l-0.7-1.7l-5.4-1.9l-2.4-4.7l0.2-4.7l2.9-0.5l5.9-1.2l5.7-3.4l3.2,0.2l3.2-2.4l2.9-0.7l2.4,0.5l7.9-3l1-1.9l4.9-0.2l3.4-1.5l0.5-1.4l2.2,0.2Z'
  },
  SE: {
    abbr: 'SE', name: 'Sergipe',
    path: 'M452.4,191.2l-4.4,0.5l-3.2,3.9l-0.2,2.4l2.4,2l4.4-1.5l1.2-1.9l3.9-1l-0.2-2.4l-2.2-1.2Z'
  },
  SP: {
    abbr: 'SP', name: 'São Paulo',
    path: 'M285.5,276l0.7-2.7l5.4,0.5l-0.5,4.2l1.5,1.5l5.2,0l0.2,2l5.7,4l3.2-3.7l3.9,1.7l0.5,2.4l1.5-0.7l4.4,2.7l0.5,2.7l1.9,1.2l-0.5,1.2l2,1.4l-0.5,4.2l2.2,1.5l1.7,3.9l6.1-1l3.9-2.9l2.7,2.4l2.9-0.2l1.5-2.4l4.4-0.5l4.2-3.4l-1-2.2l3.7-1.7l1.4-2.4l-0.7-2l2.7-2.4l0.5,1.2l3.4-1l1.9,0.7l0.5,3.9l2.4,3.2l-0.2,4.4l1.2,2.4l-0.2,6.4l1.9,1.5l-1.5,2.4l-2.9,1.5l-3.2-0.5l-4.9,1.7l-1.5,2.4l-2.7,2l-6.9,1l-2.7-0.5l0.2-2.4l-2.7-1.7l-4.2-0.2l-2.2,0.7l-3.2-1.4l-5.4-0.2l-4.4,1.5l-4.2,2.9l-4.2-0.2l-2.4-1.5l-7.4-0.5l-4.2-3.9l1.9-0.5l-1.9-1.7l2.2-3l0.5-5.4l-0.5-5.2l2.2-4.2l-0.7-5.2l-1-2.9l-6.1-3.7l-4.2-3.9Z'
  },
  TO: {
    abbr: 'TO', name: 'Tocantins',
    path: 'M326.9,112.5l-3.4-0.5l-2.4,1.7l-0.2,2.7l-2.2,2l0.7,2.9l-1.4,5.4l1.9,5.2l-0.5,1.9l1.5,1.7l-1.7,4.4l1.2,3l-1.4,4.7l0.5,3.4l-3.7-0.5l-2.7,1l-2.4-0.7l-4.7,2.7l-0.7,2.4l-3,2.4l-1.9-0.7l-2.2,2l-4.2-0.5l-1.7,2.7l-5.9-0.5l0.2-2.7l-4.4-2.2l-4.7-5.4l-3.7-2.4l-0.2-2.7l-3.2-3.2l-0.5-3.2l1.2-2.9l-1.2-5.2l2.2-5.4l-0.5-3l1.9-2.4l-0.2-4.4l-2.4-2l1.5-2.9l-2.2-4.2l0-3.2l2.4-1l0.5-3.9l-2.4-1l0.2-2.4l-1.2-1.5l-2.9,0.2l-5.4-5.4l-0.2-5.7l-2.9-1l-0.7-3l-2.7-0.7l0.5-2l-2.2-1.7l0.2-3.7l-1.5-1.7l-3.2,0.5l-2.4-1.9l-1.9,0.5l5.7-0.2l0.7,2.2l2.9,0.7l0.7-1.2l3.4,2.7l1.7-2l2.4,1.2l1.7-1.4l2.7,0.2l0.7-1.9l2.4,0.5l1.5-3.4l1.7-0.7l-0.2-2.7l1.9-0.7l-0.7-2.4l3.9-1.7l-0.7-1.4l3.2-1.7l-0.2-2.9l1.5-1.5l-0.7-2.9l1.7-0.7l-1.7-1.4l0-3l17.6,1.4l1.4,5.9l1.7,1.4l-0.2,2.9l1,2l0.2,5.4l2.2,0.7l0.2,3.4l1.9,1.4l-0.5,3l2.4,4.4l-0.5,1.4l-2.9,0.5l0.5,2.7l2.4,1.4l1,5.4l-0.7,6.4l1.7,3.7l-0.5,1.9l1.7,2.9l-0.7,2.7l0.7,3l3.2,1.5l2.2,3.4l2.4,0.2l1,1.9l3.2,1.4l0.2,3l1.2,1.5l0,3l1.2,2.2Z'
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
    if (!data || data.count === 0) return '#6ba3d6'; // Light blue for empty states
    
    const intensity = data.count / maxCount;
    
    // Blue gradient matching the reference image
    if (intensity > 0.7) return '#1e3a5f'; // Darkest navy blue
    if (intensity > 0.5) return '#2d5a87';
    if (intensity > 0.3) return '#4a7ab0';
    if (intensity > 0.15) return '#5c8fc4';
    return '#7eb1dc'; // Light blue for low values
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
                viewBox="0 0 500 450"
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
                          stroke="#a8cce8"
                          strokeWidth={isHovered ? 2 : 0.8}
                          strokeLinejoin="round"
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
                    background: 'linear-gradient(to right, #7eb1dc, #5c8fc4, #4a7ab0, #2d5a87, #1e3a5f)',
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
