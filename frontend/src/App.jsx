import React, { useState, useEffect, useRef } from 'react';
import { 
  Compass, 
  DollarSign, 
  Calendar, 
  MapPin, 
  Key, 
  Activity, 
  Hotel as HotelIcon, 
  Utensils, 
  Navigation, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Flame, 
  Info,
  HelpCircle,
  TrendingDown
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
      // EventSource generic error (e.g. lost connection)
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
          <Compass size={36} className="logo-icon" />
          <h1 className="logo-text">DestinAI</h1>
        </div>
        <div className="status-label-group">
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Powered by LangGraph Multi-Agents</span>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="dashboard-grid">
        
        {/* Left Side: Forms & Status */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-card">
            <h2 className="form-title">Plan Your Trip</h2>
            <form onSubmit={handleStartPlanning}>
              
              {/* Destination */}
              <div className="form-group">
                <label>Destination</label>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                <div className="select-container">
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
                  Custom API Key <span style={{ textTransform: 'none', color: 'var(--text-muted)' }}>(Optional)</span>
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
                <small style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                  If left blank, server-configured key will be used.
                </small>
              </div>

              <button type="submit" className="btn-primary" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="status-spinner" /> Generating Plan...
                  </>
                ) : (
                  <>
                    <Flame size={18} /> Plan My Adventure
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Workflow agent progress status trackers */}
          {(isLoading || plannerSkeleton) && (
            <div className="glass-card status-tracker">
              <h3 className="status-title">Agent Execution pipeline</h3>
              <div className="status-list">
                
                {/* Planner Agent */}
                <div className={`status-item ${agentStatuses.planner}`}>
                  <div className="status-label-group">
                    <span className="status-indicator"></span>
                    <span>Planner Agent</span>
                  </div>
                  {agentStatuses.planner === 'running' && <Loader2 size={14} className="status-spinner" />}
                  {agentStatuses.planner === 'completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  {agentStatuses.planner === 'failed' && <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
                </div>

                {/* Hotel Agent */}
                <div className={`status-item ${agentStatuses.hotel}`}>
                  <div className="status-label-group">
                    <span className="status-indicator"></span>
                    <span>Hotel Agent</span>
                  </div>
                  {agentStatuses.hotel === 'running' && <Loader2 size={14} className="status-spinner" />}
                  {agentStatuses.hotel === 'completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  {agentStatuses.hotel === 'failed' && <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
                </div>

                {/* Attractions Agent */}
                <div className={`status-item ${agentStatuses.attractions}`}>
                  <div className="status-label-group">
                    <span className="status-indicator"></span>
                    <span>Attractions Agent</span>
                  </div>
                  {agentStatuses.attractions === 'running' && <Loader2 size={14} className="status-spinner" />}
                  {agentStatuses.attractions === 'completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  {agentStatuses.attractions === 'failed' && <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
                </div>

                {/* Budget Agent */}
                <div className={`status-item ${agentStatuses.budget}`}>
                  <div className="status-label-group">
                    <span className="status-indicator"></span>
                    <span>Budget Agent</span>
                  </div>
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
            <div className="glass-card" style={{ borderColor: 'var(--danger)', background: 'hsla(355, 85%, 60%, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--danger)' }}>
                <AlertCircle />
                <strong style={{ fontFamily: 'var(--font-heading)' }}>Error</strong>
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{errorMessage}</p>
            </div>
          )}

          {/* Results available dashboard tabs */}
          {dailyItinerary || hotels || budgetBreakdown ? (
            <>
              <div className="results-tabs">
                <button 
                  className={`tab-btn ${activeTab === 'itinerary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('itinerary')}
                >
                  Itinerary
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'hotels' ? 'active' : ''}`}
                  onClick={() => setActiveTab('hotels')}
                >
                  Hotels
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'budget' ? 'active' : ''}`}
                  onClick={() => setActiveTab('budget')}
                >
                  Budget Breakdown
                </button>
              </div>

              {/* Tab Content: Itinerary */}
              {activeTab === 'itinerary' && (
                <div className="tab-content">
                  {dailyItinerary ? (
                    <div className="itinerary-list">
                      {dailyItinerary.map((day) => (
                        <div key={day.day_number} className="day-card">
                          <div className="day-card-header">
                            <div className="day-title">
                              <span className="day-number">{day.day_number}</span>
                              <span className="day-theme">{day.theme}</span>
                            </div>
                            {plannerSkeleton?.areas?.[day.day_number - 1] && (
                              <span className="day-area">{plannerSkeleton.areas[day.day_number - 1]}</span>
                            )}
                          </div>
                          <div className="day-card-body">
                            {/* Attractions */}
                            <div className="day-section-title">
                              <Activity size={14} /> Attractions & Activities
                            </div>
                            <div className="activities-grid">
                              {day.activities.map((act, index) => (
                                <div key={index} className="activity-item">
                                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{act.name}</h4>
                                  <p className="item-desc">{act.description}</p>
                                  <div className="item-meta">
                                    <span>Time: {act.recommended_time} ({act.duration})</span>
                                    <span className="item-price">{act.cost === 0 ? 'Free' : `$${act.cost}`}</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Restaurants */}
                            <div className="day-section-title">
                              <Utensils size={14} /> Restaurants
                            </div>
                            <div className="activities-grid" style={{ marginBottom: '1.25rem' }}>
                              {day.restaurants.map((rest, index) => (
                                <div key={index} className="activity-item" style={{ borderColor: 'hsla(315, 80%, 60%, 0.15)' }}>
                                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{rest.name}</h4>
                                  <p className="item-desc">{rest.description} <small>({rest.cuisine})</small></p>
                                  <div className="item-meta">
                                    <span>Location: {rest.location}</span>
                                    <span className="item-price" style={{ color: 'var(--secondary)' }}>Avg: ${rest.average_cost}</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Transit notes */}
                            {day.routing_notes && (
                              <div className="transit-banner">
                                <Navigation className="transit-icon" size={14} />
                                <span>{day.routing_notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Loader2 className="status-spinner" style={{ margin: '0 auto 1rem auto' }} />
                      <span>Attractions Agent is researching daily spots...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: Hotels */}
              {activeTab === 'hotels' && (
                <div className="tab-content">
                  {hotels ? (
                    <div className="hotel-grid">
                      {hotels.map((hotel, index) => {
                        const tier = index === 0 ? 'budget' : index === 1 ? 'mid' : 'lux';
                        const tierLabel = index === 0 ? 'Budget Tier' : index === 1 ? 'Mid-Range' : 'Luxury Tier';
                        const isSelected = budgetBreakdown?.selected_hotel_name === hotel.name;

                        return (
                          <div key={index} className="glass-card hotel-card">
                            {isSelected && (
                              <div className="hotel-selected-badge">
                                <CheckCircle2 size={12} /> Selected
                              </div>
                            )}
                            <span className={`hotel-tag ${tier}`}>{tierLabel}</span>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', paddingRight: isSelected ? '80px' : '0' }}>
                              {hotel.name}
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.75rem' }}>
                              <MapPin size={12} /> {hotel.location}
                            </p>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                              {hotel.description}
                            </p>
                            <div className="hotel-price-block">
                              <div>
                                <span className="hotel-price-lbl">Rating</span>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{hotel.rating}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span className="hotel-price-lbl">Price/Night</span>
                                <div className="hotel-price-num">${hotel.price_per_night}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Loader2 className="status-spinner" style={{ margin: '0 auto 1rem auto' }} />
                      <span>Hotel Agent is lodging search...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: Budget */}
              {activeTab === 'budget' && (
                <div className="tab-content">
                  {budgetBreakdown ? (
                    <div>
                      {/* Budget Advice banner */}
                      <div className="budget-advice-box">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                          <Info size={16} style={{ color: 'var(--primary)' }} />
                          <span>Budget Analysis & Adjustments</span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                          {budgetBreakdown.suggestions}
                        </p>
                      </div>

                      {/* Budget summary stats grid */}
                      <div className="budget-summary-grid">
                        <div className="summary-card">
                          <span className="summary-card-label">User Budget limit</span>
                          <span className="summary-card-val primary">${budget}</span>
                        </div>
                        <div className="summary-card">
                          <span className="summary-card-label">Total Estimated Cost</span>
                          <span className={`summary-card-val ${budgetBreakdown.status === 'within_budget' ? 'success' : 'danger'}`}>
                            ${budgetBreakdown.total_cost}
                          </span>
                        </div>
                        <div className="summary-card">
                          <span className="summary-card-label">Status</span>
                          <span className={`summary-card-val ${budgetBreakdown.status === 'within_budget' ? 'success' : 'danger'}`} style={{ fontSize: '1.25rem' }}>
                            {budgetBreakdown.status === 'within_budget' ? 'Within Budget' : 'Over Budget'}
                          </span>
                        </div>
                        {budgetBreakdown.status === 'within_budget' && (
                          <div className="summary-card">
                            <span className="summary-card-label">Remaining Balance</span>
                            <span className="summary-card-val success">${(parseFloat(budget) - budgetBreakdown.total_cost).toFixed(0)}</span>
                          </div>
                        )}
                      </div>

                      {/* Detail Breakdown List */}
                      <div className="glass-card" style={{ padding: '1.5rem 2rem' }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                          Cost Details
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Lodging ({budgetBreakdown.selected_hotel_name})</span>
                            <span style={{ fontWeight: 600 }}>${budgetBreakdown.hotel_costs}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Sightseeing & Activities</span>
                            <span style={{ fontWeight: 600 }}>${budgetBreakdown.activity_costs}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Dining & Meals</span>
                            <span style={{ fontWeight: 600 }}>${budgetBreakdown.food_costs}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Local Transport & Metro</span>
                            <span style={{ fontWeight: 600 }}>${budgetBreakdown.transport_costs}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 700, borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            <span>Total Estimated Expenses</span>
                            <span style={{ color: 'var(--accent-cyan)' }}>${budgetBreakdown.total_cost}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Loader2 className="status-spinner" style={{ margin: '0 auto 1rem auto' }} />
                      <span>Budget Agent is compiling estimates and optimizing...</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="glass-card empty-state">
              <Compass size={64} className="empty-state-icon" />
              <h3>Your Itinerary Awaits</h3>
              <p>Enter a destination, target budget, and days on the left and start the multi-agent workflow to build a customized plan.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
