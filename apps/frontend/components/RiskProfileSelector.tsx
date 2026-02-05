import React from 'react';
import { Shield, Scale, TrendingUp, Rocket, ChevronRight, Check } from 'lucide-react';

export type RiskProfileId = 'conservative' | 'moderate' | 'growth' | 'aggressive';

export interface RiskProfile {
  id: RiskProfileId;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  shortDescription: string;
  riskLevel: 1 | 2 | 3 | 4;
  params: {
    leverageMin: number;
    leverageMax: number;
    leverageTarget: number;
    maintenanceMarginRatio: number;
    meanReturnShrinkage: number;
    maxWeight: number;
    minWeight: number;
    windowMonths: number;
  };
  suitableFor: string[];
  notSuitableFor: string[];
}

interface Props {
  profiles: RiskProfile[];
  selected: RiskProfileId | null;
  onSelect: (profileId: RiskProfileId | null) => void;
  showCustomOption?: boolean;
  compact?: boolean;
}

const PROFILE_ICONS: Record<RiskProfileId, React.ReactNode> = {
  conservative: <Shield size={20} />,
  moderate: <Scale size={20} />,
  growth: <TrendingUp size={20} />,
  aggressive: <Rocket size={20} />,
};

const PROFILE_COLORS: Record<RiskProfileId, string> = {
  conservative: '#22c55e',
  moderate: '#3b82f6',
  growth: '#f59e0b',
  aggressive: '#ef4444',
};

const RISK_BAR_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#ef4444'];

export function RiskProfileSelector({
  profiles,
  selected,
  onSelect,
  showCustomOption = false,
  compact = false,
}: Props) {
  const [expandedProfile, setExpandedProfile] = React.useState<RiskProfileId | null>(null);

  const handleSelect = (profileId: RiskProfileId) => {
    onSelect(profileId);
    setExpandedProfile(null);
  };

  const handleToggleExpand = (profileId: RiskProfileId, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProfile(expandedProfile === profileId ? null : profileId);
  };

  if (compact) {
    return (
      <div style={compactContainerStyle}>
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => handleSelect(profile.id)}
            style={{
              ...compactButtonStyle,
              borderColor: selected === profile.id ? PROFILE_COLORS[profile.id] : 'var(--input-border)',
              background: selected === profile.id ? `${PROFILE_COLORS[profile.id]}15` : 'transparent',
            }}
          >
            <span style={{ color: PROFILE_COLORS[profile.id] }}>
              {PROFILE_ICONS[profile.id]}
            </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {profile.name}
            </span>
            {selected === profile.id && (
              <Check size={16} style={{ color: PROFILE_COLORS[profile.id] }} />
            )}
          </button>
        ))}
        {showCustomOption && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            style={{
              ...compactButtonStyle,
              borderColor: selected === null ? '#8b5cf6' : 'var(--input-border)',
              background: selected === null ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
            }}
          >
            <span style={{ color: '#8b5cf6', fontSize: '1rem' }}>⚙️</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              Personalizado
            </span>
            {selected === null && (
              <Check size={16} style={{ color: '#8b5cf6' }} />
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {profiles.map((profile) => {
        const isSelected = selected === profile.id;
        const isExpanded = expandedProfile === profile.id;
        const color = PROFILE_COLORS[profile.id];

        return (
          <div
            key={profile.id}
            onClick={() => handleSelect(profile.id)}
            style={{
              ...cardStyle,
              borderColor: isSelected ? color : 'var(--input-border)',
              background: isSelected ? `${color}10` : 'var(--bg-card)',
            }}
          >
            {/* Header */}
            <div style={headerStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ ...iconContainerStyle, background: `${color}20`, color }}>
                  {PROFILE_ICONS[profile.id]}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>
                      {profile.name}
                    </span>
                    {isSelected && (
                      <div style={{ ...checkBadgeStyle, background: color }}>
                        <Check size={12} />
                      </div>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.125rem' }}>
                    {profile.shortDescription}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => handleToggleExpand(profile.id, e)}
                style={expandButtonStyle}
              >
                <ChevronRight
                  size={18}
                  style={{
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    color: 'var(--text-muted)',
                  }}
                />
              </button>
            </div>

            {/* Risk Level Bar */}
            <div style={riskBarContainerStyle}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Nivel de riesgo
              </span>
              <div style={riskBarTrackStyle}>
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    style={{
                      ...riskBarSegmentStyle,
                      background: level <= profile.riskLevel ? RISK_BAR_COLORS[level - 1] : 'var(--input-border)',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Leverage Summary */}
            <div style={leverageSummaryStyle}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Leverage:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.875rem' }}>
                {profile.params.leverageMin}x - {profile.params.leverageMax}x
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                (objetivo: {profile.params.leverageTarget}x)
              </span>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div style={expandedStyle}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
                  {profile.description}
                </p>

                {/* Suitable For */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    ✓ Ideal para
                  </div>
                  <ul style={listStyle}>
                    {profile.suitableFor.map((item, idx) => (
                      <li key={idx} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Not Suitable For */}
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    ⚠ No recomendado si
                  </div>
                  <ul style={listStyle}>
                    {profile.notSuitableFor.map((item, idx) => (
                      <li key={idx} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Custom Option */}
      {showCustomOption && (
        <div
          onClick={() => onSelect(null)}
          style={{
            ...cardStyle,
            borderColor: selected === null ? '#8b5cf6' : 'var(--input-border)',
            background: selected === null ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-card)',
          }}
        >
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ ...iconContainerStyle, background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6' }}>
                <span style={{ fontSize: '1rem' }}>⚙️</span>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>
                    Personalizado
                  </span>
                  {selected === null && (
                    <div style={{ ...checkBadgeStyle, background: '#8b5cf6' }}>
                      <Check size={12} />
                    </div>
                  )}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.125rem' }}>
                  Configura los parámetros manualmente
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// STYLES
// ============================================

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const compactContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
};

const compactButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 0.875rem',
  border: '1px solid var(--input-border)',
  borderRadius: '8px',
  background: 'transparent',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  border: '1px solid var(--input-border)',
  borderRadius: '12px',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
};

const iconContainerStyle: React.CSSProperties = {
  width: '40px',
  height: '40px',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const checkBadgeStyle: React.CSSProperties = {
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
};

const expandButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const riskBarContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  marginTop: '0.875rem',
};

const riskBarTrackStyle: React.CSSProperties = {
  display: 'flex',
  gap: '3px',
  flex: 1,
};

const riskBarSegmentStyle: React.CSSProperties = {
  height: '6px',
  flex: 1,
  borderRadius: '3px',
};

const leverageSummaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginTop: '0.75rem',
  flexWrap: 'wrap',
};

const expandedStyle: React.CSSProperties = {
  marginTop: '1rem',
  paddingTop: '1rem',
  borderTop: '1px solid var(--border)',
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

export default RiskProfileSelector;
