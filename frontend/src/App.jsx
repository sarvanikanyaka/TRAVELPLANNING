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
  ArrowRight,
  Map,
  Layers,
  Award,
  BookOpen,
  ChevronDown,
  ChevronUp,
  User,
  Mail,
  Lock,
  LogOut
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  // Authentication states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'register'
  const [currentUser, setCurrentUser] = useState(null);
  
  // Auth Form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  // Planner Form input states
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
  
  // Dynamic Currency states loaded from RAG/State
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [currencyCode, setCurrencyCode] = useState('USD');
  
  // RAG states
  const [retrievedContext, setRetrievedContext] = useState(null);
  const [isCitationsOpen, setIsCitationsOpen] = useState(true);

  // Streaming State updates from LangGraph
  const [plannerSkeleton, setPlannerSkeleton] = useState(null);
  const [hotels, setHotels] = useState(null);
  const [dailyItinerary, setDailyItinerary] = useState(null);
  const [budgetBreakdown, setBudgetBreakdown] = useState(null);
  
  // Track agent statuses: 'idle' | 'running' | 'completed' | 'failed'
  const [agentStatuses, setAgentStatuses] = useState({
    retrieval: 'idle',
    planner: 'idle',
    hotel: 'idle',
    attractions: 'idle',
    budget: 'idle'
  });

  const eventSourceRef = useRef(null);

  // Check login state on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('destinai_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setCurrentUser(parsed);
      setIsLoggedIn(true);
    }
  }, []);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auth Operations
  const handleAuthSubmit = (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    // Basic Validations
    if (!email.trim() || !password.trim()) {
      setAuthError('All fields are required');
      return;
    }
    if (!email.includes('@')) {
      setAuthError('Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }

    if (authTab === 'register') {
      if (!fullName.trim()) {
        setAuthError('Full name is required for registration');
        return;
      }
      
      // Save user in localStorage (simulating registration database)
      const userObj = { email, fullName, password };
      localStorage.setItem(`user_${email}`, JSON.stringify(userObj));
      setAuthSuccess('Account registered successfully! Please log in.');
      setAuthTab('login');
      setPassword('');
    } else {
      // Mock login check
      const record = localStorage.getItem(`user_${email}`);
      if (!record) {
        setAuthError('Account not found. Please register first.');
        return;
      }
      const parsedRecord = JSON.parse(record);
      if (parsedRecord.password !== password) {
        setAuthError('Incorrect password');
        return;
      }

      // Log in
      localStorage.setItem('destinai_user', JSON.stringify({ email, fullName: parsedRecord.fullName }));
      setCurrentUser({ email, fullName: parsedRecord.fullName });
      setIsLoggedIn(true);
      setEmail('');
      setPassword('');
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('destinai_user');
    setCurrentUser(null);
    setIsLoggedIn(false);
    
    // Reset planner states
    setPlannerSkeleton(null);
    setHotels(null);
    setDailyItinerary(null);
    setBudgetBreakdown(null);
    setRetrievedContext(null);
    setCurrencySymbol('$');
    setCurrencyCode('USD');
  };

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
    setRetrievedContext(null);
    setCurrencySymbol('$');
    setCurrencyCode('USD');
    setIsLoading(true);
    
    setAgentStatuses({
      retrieval: 'running',
      planner: 'idle',
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
        
        // Dynamically capture RAG contexts & currency config
        if (state.currency_symbol) setCurrencySymbol(state.currency_symbol);
        if (state.currency) setCurrencyCode(state.currency);
        if (state.retrieved_context) setRetrievedContext(state.retrieved_context);
        
        // Update specific states based on which agent has run
        if (state.planner_skeleton) setPlannerSkeleton(state.planner_skeleton);
        if (state.hotels) setHotels(state.hotels);
        if (state.daily_itinerary) setDailyItinerary(state.daily_itinerary);
        if (state.budget_breakdown) setBudgetBreakdown(state.budget_breakdown);

        // Update progress tracking step state
        setAgentStatuses(prev => {
          const next = { ...prev };
          if (agent === 'retrieval') {
            next.retrieval = 'completed';
            next.planner = 'running';
          } else if (agent === 'planner') {
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
        retrieval: 'completed',
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
        retrieval: prev => prev === 'running' ? 'failed' : prev,
        planner: prev => prev === 'running' ? 'failed' : prev,
        hotel: prev => prev === 'running' ? 'failed' : prev,
        attractions: prev => prev === 'running' ? 'failed' : prev,
        budget: prev => prev === 'running' ? 'failed' : prev,
      });
      es.close();
    };
  };

  // Auth Screen Gate
  if (!isLoggedIn) {
    return (
      <div className="auth-screen">
        <div className="auth-background-circle auth-bg-1"></div>
        <div className="auth-background-circle auth-bg-2"></div>
        
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <Compass size={40} className="logo-icon" />
              <h1 className="auth-logo-text">DestinAI</h1>
            </div>
            <p className="auth-tagline">RAG-Powered Multi-Agent Travel Planner</p>
          </div>

          <div className="auth-tabs">
            <button 
              type="button" 
              className={`auth-tab-btn ${authTab === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthTab('login'); setAuthError(''); }}
            >
              Sign In
            </button>
            <button 
              type="button" 
              className={`auth-tab-btn ${authTab === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthTab('register'); setAuthError(''); }}
            >
              Register
            </button>
          </div>

          {authError && (
            <div className="validation-error" style={{ marginBottom: '1.25rem', justifyContent: 'center' }}>
              <AlertCircle size={14} /> {authError}
            </div>
          )}

          {authSuccess && (
            <div className="auth-success-box">
              <CheckCircle2 size={14} /> {authSuccess}
            </div>
          )}

          <form onSubmit={handleAuthSubmit}>
            {authTab === 'register' && (
              <div className="form-group">
                <label>Full Name</label>
                <div className="input-container">
                  <User className="input-icon" size={18} />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Email Address</label>
              <div className="input-container">
                <Mail className="input-icon" size={18} />
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="input-container">
                <Lock className="input-icon" size={18} />
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ marginTop: '1.75rem' }}>
              {authTab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header Banner */}
      <header className="app-header">
        <div className="logo-section">
          <Compass size={32} className="logo-icon" />
          <h1 className="logo-text">DestinAI</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div className="user-menu-section">
            <span className="user-welcome-text">
              Welcome, <strong>{currentUser?.fullName || 'Traveler'}</strong>
            </span>
            <button className="btn-signout" onClick={handleSignOut}>
              <LogOut size={12} style={{ marginRight: '0.25rem', display: 'inline-block', verticalAlign: 'middle' }} />
              Sign Out
            </button>
          </div>
          <div className="header-badge">
            <span className="pulse-dot"></span>
            <span>RAG Active</span>
          </div>
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
                    placeholder="e.g. Tokyo, Paris, Goa India" 
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
                  <label>Budget ({currencySymbol})</label>
                  <div className="input-container">
                    <span className="input-icon" style={{ left: '1.1rem', fontWeight: 700, fontSize: '0.95rem' }}>{currencySymbol}</span>
                    <input 
                      type="number" 
                      className={`form-input ${errors.budget ? 'error' : ''}`}
                      placeholder="e.g. 1500" 
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      disabled={isLoading}
                      style={{ paddingLeft: '2.5rem' }}
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
              <h3 className="status-title">RAG Agent Pipeline</h3>
              <div className="timeline-list">
                
                {/* RAG Retrieval Agent */}
                <div className={`timeline-step ${agentStatuses.retrieval}`}>
                  <span className="timeline-step-label">RAG Retrieval Agent</span>
                  {agentStatuses.retrieval === 'running' && <Loader2 size={14} className="status-spinner" />}
                  {agentStatuses.retrieval === 'completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  {agentStatuses.retrieval === 'failed' && <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
                </div>

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
                      <span style={{ fontWeight: 700 }}>{currencySymbol}</span> <span>Target: {budget} {currencyCode}</span>
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
                        {currencySymbol}{budgetBreakdown.total_cost}
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
                                    <span className="item-cost-tag">{act.cost === 0 ? 'Free' : `${currencySymbol}${act.cost}`}</span>
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
                                    <span className="item-cost-tag">Avg: {currencySymbol}{rest.average_cost}</span>
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
                                <div className="hotel-rate-val">{currencySymbol}{hotel.price_per_night}</div>
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
                          <span className="metric-val indigo">{currencySymbol}{budget}</span>
                        </div>
                        <div className="metric-pill-card">
                          <span className="metric-label">Total Computed Cost</span>
                          <span className={`metric-val ${budgetBreakdown.status === 'within_budget' ? 'success' : 'danger'}`}>
                            {currencySymbol}{budgetBreakdown.total_cost}
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
                            <span style={{ fontWeight: 600 }}>{currencySymbol}{budgetBreakdown.hotel_costs}</span>
                          </div>
                          <div className="ledger-row">
                            <span className="ledger-row-label">Sightseeing & Activity Entrance Fees</span>
                            <span style={{ fontWeight: 600 }}>{currencySymbol}{budgetBreakdown.activity_costs}</span>
                          </div>
                          <div className="ledger-row">
                            <span className="ledger-row-label">Meals & Restaurant Dining</span>
                            <span style={{ fontWeight: 600 }}>{currencySymbol}{budgetBreakdown.food_costs}</span>
                          </div>
                          <div className="ledger-row">
                            <span className="ledger-row-label">Estimated Transit & local metro</span>
                            <span style={{ fontWeight: 600 }}>{currencySymbol}{budgetBreakdown.transport_costs}</span>
                          </div>
                          <div className="ledger-row">
                            <span style={{ color: '#fff', fontWeight: 700 }}>Total Final Bill</span>
                            <span style={{ color: 'var(--accent-cyan)', fontWeight: 800 }}>{currencySymbol}{budgetBreakdown.total_cost}</span>
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

              {/* RAG Collapsible citations section */}
              {retrievedContext && retrievedContext.length > 0 && (
                <div className="citations-box">
                  <div className="citations-header" onClick={() => setIsCitationsOpen(!isCitationsOpen)}>
                    <div className="citations-title">
                      <BookOpen size={16} />
                      <span>Verified Knowledge Sources (RAG Retriever)</span>
                    </div>
                    {isCitationsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                  {isCitationsOpen && (
                    <div className="citations-list">
                      {retrievedContext.map((text, idx) => (
                        <div key={idx} className="citation-item">
                          <div className="citation-header-meta">
                            <span>Knowledge Source Chunk #{idx + 1}</span>
                            <span className="citation-badge">Guidebook Fact</span>
                          </div>
                          <p>{text}</p>
                        </div>
                      ))}
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
              <p>Configure your destination, budget constraints, and day count in the panel to launch the RAG-powered multi-agent travel compilation graph.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
