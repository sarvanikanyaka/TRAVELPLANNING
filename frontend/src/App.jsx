import React, { useState, useEffect, useRef } from 'react';
import { 
  Compass, 
  DollarSign, 
  Calendar, 
  MapPin, 
  Key, 
  Sparkles, 
  Activity, 
  Hotel as HotelIcon, 
  Utensils, 
  Navigation, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Flame, 
  Info,
  TrendingDown,
  ArrowRight,
  TrendingUp,
  Map,
  Layers,
  Award
} from 'lucide-react';

const BACKEND_URL = 'http://localhost:8000';

function App() {
  // Form input states
  const [destination, setDestination] = useState('Tokyo, Japan');
  const [budget, setBudget] = useState('1500');
  const [days, setDays] = useState('5');
  const [provider, setProvider] = useState('openai');
  const [customKey, setCustomKey] = useState('');
  
  // Validation errors
  const [errors, setErrors] = useState({});
  
  // App workflow states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('itinerary'); // 'itinerary', 'hotels', 'budget'
  
  // Streaming State updates from LangGraph
  const [plannerSkeleton, setPlannerSkeleton] = useState(null);
  const [hotels, setHotels] = useState(null);
  const [dailyItinerary, setDailyItinerary] = useState(null);
  const [budgetBreakdown, setBudgetBreakdown] = useState(null);
  
  // Track agent statuses: 'idle' | 'running' | 'completed' | 'failed'
  const [agentStatuses, setAgentStatuses] = useState({
    planner: 'idle',
    hotel: 'idle',
    attractions: 'idle',
    budget: 'idle'
  });

  const eventSourceRef = useRef(null);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Form input validation
  const validateForm = () => {
    const newErrors = {};
    if (!destination.trim()) {
      newErrors.destination = 'Destination is required';
    }
    
    const budgetNum = parseFloat(budget);
    if (isNaN(budgetNum) || budgetNum <= 0) {
      newErrors.budget = 'Budget must be a positive number';
    }
    
    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 14) {
      newErrors.days = 'Days must be between 1 and 14';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStartPlanning = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    // Reset previous states
    setErrorMessage('');
    setPlannerSkeleton(null);
    setHotels(null);
    setDailyItinerary(null);
    setBudgetBreakdown(null);
    setIsLoading(true);
    
    setAgentStatuses({
      planner: 'running',
      hotel: 'idle',
      attractions: 'idle',
      budget: 'idle'
    });

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Build query URL
    const queryParams = new URLSearchParams({
      destination: destination.trim(),
      budget: budget.trim(),
      days: days.trim(),
      provider: provider,
    });

    if (customKey.trim()) {
      queryParams.append('api_key', customKey.trim());
    }

    const sseUrl = `${BACKEND_URL}/api/plan/stream?${queryParams.toString()}`;
    
    // Connect to Server-Sent Events endpoint
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.addEventListener('agent_update', (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { agent, state } = payload;
        
        // Update specific states based on which agent has run
        if (state.planner_skeleton) setPlannerSkeleton(state.planner_skeleton);
        if (state.hotels) setHotels(state.hotels);
        if (state.daily_itinerary) setDailyItinerary(state.daily_itinerary);
        if (state.budget_breakdown) setBudgetBreakdown(state.budget_breakdown);

        // Update progress tracking step state
        setAgentStatuses(prev => {
          const next = { ...prev };
          if (agent === 'planner') {
            next.planner = 'completed';
            next.hotel = 'running';
          } else if (agent === 'hotel') {
            next.hotel = 'completed';
            next.attractions = 'running';
          } else if (agent === 'attractions') {
            next.attractions = 'completed';
            next.budget = 'running';
          }
          return next;
        });
      } catch (err) {
        console.error('Failed to parse SSE payload', err);
      }
    });

    es.addEventListener('agent_error', (event) => {
      const payload = JSON.parse(event.data);
      const { agent, error } = payload;
      setErrorMessage(`Agent Error in ${agent}: ${error}`);
      setAgentStatuses(prev => ({ ...prev, [agent]: 'failed' }));
      setIsLoading(false);
      es.close();
    });

    es.addEventListener('system_error', (event) => {
      const payload = JSON.parse(event.data);
      setErrorMessage(`System Error: ${payload.error}`);
      setIsLoading(false);
      es.close();
    });

    es.addEventListener('done', (event) => {
      setAgentStatuses(prev => ({
        planner: 'completed',
        hotel: 'completed',
        attractions: 'completed',
        budget: 'completed'
      }));
      setIsLoading(false);
      es.close();
      setActiveTab('itinerary'); // Switch to itinerary tab automatically
    });

    es.onerror = (err) => {
      setErrorMessage('Failed to connect to backend planning server. Make sure the FastAPI app is running on localhost:8000.');
      setIsLoading(false);
      setAgentStatuses({
        planner: prev => prev === 'running' ? 'failed' : prev,
        hotel: prev => prev === 'running' ? 'failed' : prev,
        attractions: prev => prev === 'running' ? 'failed' : prev,
        budget: prev => prev === 'running' ? 'failed' : prev,
      });
      es.close();
    };
  };

  return (
    <div className="app-container">
      {/* Header Banner */}
      <header className="app-header">
        <div className="logo-section">
          <Compass size={32} className="logo-icon" />
          <h1 className="logo-text">DestinAI</h1>
        </div>
        <div className="header-badge">
          <span className="pulse-dot"></span>
          <span>LangGraph Orchestrated Workflow</span>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="dashboard-grid">
        
        {/* Left Side: Forms & Status */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-card">
            <h2 className="form-title">Create Itinerary</h2>
            <form onSubmit={handleStartPlanning}>
              
              {/* Destination */}
              <div className="form-group">
                <label>Where to go?</label>
                <div className="input-container">
                  <MapPin className="input-icon" size={18} />
                  <input 
                    type="text" 
                    className={`form-input ${errors.destination ? 'error' : ''}`}
                    placeholder="e.g. Tokyo, Paris, Rome" 
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                {errors.destination && (
                  <div className="validation-error">
                    <AlertCircle size={12} /> {errors.destination}
                  </div>
                )}
              </div>

              {/* Budget & Days */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Budget (USD)</label>
                  <div className="input-container">
                    <DollarSign className="input-icon" size={18} />
                    <input 
                      type="number" 
                      className={`form-input ${errors.budget ? 'error' : ''}`}
                      placeholder="e.g. 1500" 
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  {errors.budget && (
                    <div className="validation-error">
                      <AlertCircle size={12} /> {errors.budget}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Days</label>
                  <div className="input-container">
                    <Calendar className="input-icon" size={18} />
                    <input 
                      type="number" 
                      className={`form-input ${errors.days ? 'error' : ''}`}
                      placeholder="e.g. 5" 
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  {errors.days && (
                    <div className="validation-error">
                      <AlertCircle size={12} /> {errors.days}
                    </div>
                  )}
                </div>
              </div>

              {/* Model selection */}
              <div className="form-group">
                <label>AI Model Provider</label>
                <div className="input-container">
                  <Layers className="input-icon" size={18} />
                  <select 
                    className="form-select" 
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    disabled={isLoading}
                  >
                    <option value="openai">OpenAI (gpt-4o-mini)</option>
                    <option value="gemini">Gemini (gemini-1.5-flash)</option>
                  </select>
                </div>
              </div>

              {/* API Key Override */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Custom API Key <span style={{ textTransform: 'none', color: 'var(--text-secondary)' }}>(Optional)</span>
                </label>
                <div className="input-container">
                  <Key className="input-icon" size={18} />
                  <input 
                    type="password" 
                    className="form-input"
                    placeholder="sk-..." 
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <small style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.35rem', lineHeight: 1.3 }}>
                  Overrides default server environment key if provided.
                </small>
              </div>

              <button type="submit" className="btn-primary" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="status-spinner" /> Running Workflow...
                  </>
                ) : (
                  <>
                    <Flame size={18} /> Plan My Adventure <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Timeline Step Status Tracker */}
          {(isLoading || plannerSkeleton) && (
            <div className="glass-card status-tracker">
              <h3 className="status-title">AI Agents Pipeline</h3>
              <div className="timeline-list">
                
                {/* Planner Agent */}
                <div className={`timeline-step ${agentStatuses.planner}`}>
                  <span className="timeline-step-label">Planner Agent</span>
                  {agentStatuses.planner === 'running' && <Loader2 size={14} className="status-spinner" />}
                  {agentStatuses.planner === 'completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  {agentStatuses.planner === 'failed' && <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
                </div>

                {/* Hotel Agent */}
                <div className={`timeline-step ${agentStatuses.hotel}`}>
                  <span className="timeline-step-label">Hotel Agent</span>
                  {agentStatuses.hotel === 'running' && <Loader2 size={14} className="status-spinner" />}
                  {agentStatuses.hotel === 'completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  {agentStatuses.hotel === 'failed' && <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
                </div>

                {/* Attractions Agent */}
                <div className={`timeline-step ${agentStatuses.attractions}`}>
                  <span className="timeline-step-label">Attractions Agent</span>
                  {agentStatuses.attractions === 'running' && <Loader2 size={14} className="status-spinner" />}
                  {agentStatuses.attractions === 'completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  {agentStatuses.attractions === 'failed' && <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
                </div>

                {/* Budget Agent */}
                <div className={`timeline-step ${agentStatuses.budget}`}>
                  <span className="timeline-step-label">Budget Agent</span>
                  {agentStatuses.budget === 'running' && <Loader2 size={14} className="status-spinner" />}
                  {agentStatuses.budget === 'completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  {agentStatuses.budget === 'failed' && <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
                </div>

              </div>
            </div>
          )}
        </section>

        {/* Right Side: Results Display */}
        <section className="results-section">
          {errorMessage && (
            <div className="glass-card" style={{ borderColor: 'var(--danger)', background: 'hsla(356, 85%, 55%, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--danger)' }}>
                <AlertCircle />
                <strong style={{ fontFamily: 'var(--font-heading)' }}>Pipeline Error</strong>
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{errorMessage}</p>
            </div>
          )}

          {/* Results dashboard */}
          {dailyItinerary || hotels || budgetBreakdown ? (
            <>
              {/* Destination Top Banner Card */}
              <div className="destination-banner">
                <div className="dest-details">
                  <h2>{destination}</h2>
                  <div className="dest-meta">
                    <div className="dest-badge">
                      <Calendar size={14} /> <span>{days} Days</span>
                    </div>
                    <div className="dest-badge">
                      <DollarSign size={14} /> <span>Target: ${budget}</span>
                    </div>
                    {budgetBreakdown && (
                      <div className="dest-badge">
                        <Award size={14} /> <span>{budgetBreakdown.status === 'within_budget' ? 'Within Budget' : 'Exceeds Budget'}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ textSelf: 'flex-end', textAlign: 'right' }}>
                  {budgetBreakdown && (
                    <>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Total Estimate</div>
                      <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-cyan)', fontFamily: 'var(--font-heading)', lineHeight: 1.1 }}>
                        ${budgetBreakdown.total_cost}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Tabs list */}
              <nav className="tabs-navigation">
                <button 
                  className={`tab-button ${activeTab === 'itinerary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('itinerary')}
                >
                  <Map size={16} /> Daily Itinerary
                </button>
                <button 
                  className={`tab-button ${activeTab === 'hotels' ? 'active' : ''}`}
                  onClick={() => setActiveTab('hotels')}
                >
                  <HotelIcon size={16} /> Hotel Tiers
                </button>
                <button 
                  className={`tab-button ${activeTab === 'budget' ? 'active' : ''}`}
                  onClick={() => setActiveTab('budget')}
                >
                  <DollarSign size={16} /> Budget Ledger
                </button>
              </nav>

              {/* Tab Content: Itinerary */}
              {activeTab === 'itinerary' && (
                <div className="tab-content">
                  {dailyItinerary ? (
                    <div className="itinerary-timeline">
                      {dailyItinerary.map((day) => (
                        <div key={day.day_number} className="day-card">
                          <div className="day-card-header">
                            <div className="day-info">
                              <span className="day-pill">DAY {day.day_number}</span>
                              <span className="day-theme-text">{day.theme}</span>
                            </div>
                            {plannerSkeleton?.areas?.[day.day_number - 1] && (
                              <span className="day-area-pill">{plannerSkeleton.areas[day.day_number - 1]}</span>
                            )}
                          </div>
                          <div className="day-card-body">
                            {/* Sights */}
                            <div className="day-column-title">
                              <Activity size={14} /> Sights & Attractions
                            </div>
                            <div className="items-grid">
                              {day.activities.map((act, idx) => (
                                <div key={idx} className="item-glass-box">
                                  <div>
                                    <h4 className="item-name">{act.name}</h4>
                                    <p className="item-desc-text">{act.description}</p>
                                  </div>
                                  <div className="item-footer">
                                    <span>🕒 {act.recommended_time} ({act.duration})</span>
                                    <span className="item-cost-tag">{act.cost === 0 ? 'Free' : `$${act.cost}`}</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Dining */}
                            <div className="day-column-title">
                              <Utensils size={14} /> Local Dining
                            </div>
                            <div className="items-grid dining-grid" style={{ marginBottom: '1.5rem' }}>
                              {day.restaurants.map((rest, idx) => (
                                <div key={idx} className="item-glass-box">
                                  <div>
                                    <h4 className="item-name">{rest.name}</h4>
                                    <p className="item-desc-text">{rest.description} <small style={{ color: 'var(--primary-purple)' }}>({rest.cuisine})</small></p>
                                  </div>
                                  <div className="item-footer">
                                    <span>📍 {rest.location}</span>
                                    <span className="item-cost-tag">Avg: ${rest.average_cost}</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Routing Tips */}
                            {day.routing_notes && (
                              <div className="transit-footer-bar">
                                <Navigation size={14} />
                                <span>{day.routing_notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <Loader2 className="status-spinner" style={{ margin: '0 auto 1.25rem auto', width: '24px', height: '24px' }} />
                      <span>Attractions Agent is researching local activities...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: Hotels */}
              {activeTab === 'hotels' && (
                <div className="tab-content">
                  {hotels ? (
                    <div className="hotels-grid">
                      {hotels.map((hotel, idx) => {
                        const tier = idx === 0 ? 'budget' : idx === 1 ? 'mid' : 'lux';
                        const tierLabel = idx === 0 ? 'Budget Tier' : idx === 1 ? 'Mid-Range' : 'Luxury Tier';
                        const isSelected = budgetBreakdown?.selected_hotel_name === hotel.name;

                        return (
                          <div key={idx} className={`glass-card hotel-premium-card ${isSelected ? 'selected' : ''}`}>
                            {isSelected && (
                              <div className="hotel-selected-banner">
                                <CheckCircle2 size={12} /> Selected
                              </div>
                            )}
                            <span className={`hotel-badge-tier ${tier}`}>{tierLabel}</span>
                            <h3 className="hotel-name">{hotel.name}</h3>
                            <div className="hotel-loc">
                              <MapPin size={12} /> {hotel.location}
                            </div>
                            <p className="hotel-desc">{hotel.description}</p>
                            <div className="hotel-pricing-box">
                              <div>
                                <span className="hotel-rate-title">Rating</span>
                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginTop: '0.15rem' }}>{hotel.rating}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span className="hotel-rate-title">Est. / Night</span>
                                <div className="hotel-rate-val">${hotel.price_per_night}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <Loader2 className="status-spinner" style={{ margin: '0 auto 1.25rem auto', width: '24px', height: '24px' }} />
                      <span>Hotel Agent is looking up accommodations...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: Budget */}
              {activeTab === 'budget' && (
                <div className="tab-content">
                  {budgetBreakdown ? (
                    <div>
                      {/* Financial advice block */}
                      <div className="ledger-advice">
                        <div className="advice-header">
                          <Sparkles size={16} />
                          <span>AI Budget Advisor Notes</span>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.55 }}>
                          {budgetBreakdown.suggestions}
                        </p>
                      </div>

                      {/* Financial Pill Metrics */}
                      <div className="ledger-summary-row">
                        <div className="metric-pill-card">
                          <span className="metric-label">Target Budget Limit</span>
                          <span className="metric-val indigo">${budget}</span>
                        </div>
                        <div className="metric-pill-card">
                          <span className="metric-label">Total Computed Cost</span>
                          <span className={`metric-val ${budgetBreakdown.status === 'within_budget' ? 'success' : 'danger'}`}>
                            ${budgetBreakdown.total_cost}
                          </span>
                        </div>
                        <div className="metric-pill-card">
                          <span className="metric-label">Status</span>
                          <span className={`metric-val ${budgetBreakdown.status === 'within_budget' ? 'success' : 'danger'}`} style={{ fontSize: '1.2rem' }}>
                            {budgetBreakdown.status === 'within_budget' ? 'Within Budget' : 'Over Budget'}
                          </span>
                        </div>
                      </div>

                      {/* Visual budget comparison gauge bar */}
                      {(() => {
                        const total = budgetBreakdown.total_cost;
                        const target = parseFloat(budget) || 1;
                        const percentage = Math.min(100, Math.round((total / target) * 100));
                        const isOver = total > target;

                        return (
                          <div className="gauge-bar-container">
                            <div className="gauge-header">
                              <span>Budget Usage Gauge</span>
                              <span>{percentage}% Used</span>
                            </div>
                            <div className="gauge-rail">
                              <div 
                                className={`gauge-fill ${isOver ? 'over' : 'under'}`} 
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {/* Detailed Cost Ledger Table */}
                      <div className="glass-card ledger-table-card">
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }}>
                          Itinerary Ledger Items
                        </h3>
                        <div>
                          <div className="ledger-row">
                            <span className="ledger-row-label">Accommodation (Selected Tier: {budgetBreakdown.selected_hotel_name})</span>
                            <span style={{ fontWeight: 600 }}>${budgetBreakdown.hotel_costs}</span>
                          </div>
                          <div className="ledger-row">
                            <span className="ledger-row-label">Sightseeing & Activity Entrance Fees</span>
                            <span style={{ fontWeight: 600 }}>${budgetBreakdown.activity_costs}</span>
                          </div>
                          <div className="ledger-row">
                            <span className="ledger-row-label">Meals & Restaurant Dining</span>
                            <span style={{ fontWeight: 600 }}>${budgetBreakdown.food_costs}</span>
                          </div>
                          <div className="ledger-row">
                            <span className="ledger-row-label">Estimated Transit & local metro</span>
                            <span style={{ fontWeight: 600 }}>${budgetBreakdown.transport_costs}</span>
                          </div>
                          <div className="ledger-row">
                            <span style={{ color: '#fff', fontWeight: 700 }}>Total Final Bill</span>
                            <span style={{ color: 'var(--accent-cyan)', fontWeight: 800 }}>${budgetBreakdown.total_cost}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <Loader2 className="status-spinner" style={{ margin: '0 auto 1.25rem auto', width: '24px', height: '24px' }} />
                      <span>Budget Agent is consolidating ledger items...</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="glass-card empty-dashboard">
              <div className="empty-icon-wrap">
                <Compass size={44} />
              </div>
              <h3>Explore Awaits</h3>
              <p>Configure your destination, budget constraints, and day count in the panel to launch the multi-agent travel compilation graph.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
