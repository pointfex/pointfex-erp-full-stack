import { useState, useMemo, useEffect } from 'react'
import { Card } from '../../components/common/Card'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../utils/formatters'
import {
  Handshake,
  MessageSquare,
  Sparkles,
  BookOpen,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Plus,
  Lightbulb,
  Award,
  ChevronRight,
  X,
} from 'lucide-react'

export interface ConsultationRequest {
  id: string
  requesterId: string
  requesterName: string
  requesterRole: string
  advisorId: string
  advisorName: string
  advisorRole: string
  topic: string
  category: string
  reason: string
  specificQuestions: string
  priority: 'NORMAL' | 'HIGH' | 'URGENT'
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'DECLINED'
  adviceNotes?: string
  createdAt: string
  respondedAt?: string
}

export interface ExecutiveLearningNote {
  id: string
  authorId: string
  authorName: string
  authorRole: 'CEO' | 'CTO' | 'CFO' | 'CHRO' | 'CPO'
  title: string
  category: string
  targetAudience: string
  executiveSummary: string
  detailedContent: string
  takeaways: string[]
  publishedAt: string
}

const STORAGE_KEY_CONSULTATIONS = 'pointfex_consultation_requests_v1'
const STORAGE_KEY_EXEC_NOTES = 'pointfex_exec_learning_notes_v1'

const INITIAL_CONSULTATIONS: ConsultationRequest[] = [
  {
    id: 'cons_01',
    requesterId: 'emp_dev_01',
    requesterName: 'Pramit Datta',
    requesterRole: 'Software Developer',
    advisorId: 'emp_cto_01',
    advisorName: 'A.R.M Abir Hasan',
    advisorRole: 'CTO',
    topic: 'Prisma Connection Pooling in Neon Serverless',
    category: 'System Architecture & Database',
    reason:
      'We are experiencing intermittent cold start latency spikes during bursty task updates in sprint transitions.',
    specificQuestions:
      '1. Should we enforce pgbouncer in transaction mode?\n2. What is the recommended client-side pool size ceiling?',
    priority: 'HIGH',
    status: 'COMPLETED',
    adviceNotes:
      'Verified with DevOps: enable pgBouncer pooled connections (port 6543) for all ephemeral queries, while pinning Prisma migration scripts directly to port 5432. Set connection_limit=10 in .env to eliminate serverless pool exhaustion.',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    respondedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'cons_02',
    requesterId: 'emp_pm_01',
    requesterName: 'Fahim Uddin',
    requesterRole: 'Project Manager',
    advisorId: 'emp_cfo_01',
    advisorName: 'MD. Ferdous Hasan Rahid',
    advisorRole: 'CFO',
    topic: 'Milestone Escrow Allocation for LawLens Phase 2',
    category: 'Finance & Project Scoping',
    reason:
      'Need clarity on how milestone-linked deliverables unlock bonus reserves before sprint sign-off.',
    specificQuestions:
      'Can developer performance bonus tranches be disbursed incrementally before full project finalization?',
    priority: 'NORMAL',
    status: 'COMPLETED',
    adviceNotes:
      'Yes, CFO policy permits milestone-based escrow release upon PM + QA sign-off without waiting for full project closure. Submit batch allocation via Treasury inbox with deliverable proofs attached.',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    respondedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
]

const INITIAL_EXEC_NOTES: ExecutiveLearningNote[] = [
  {
    id: 'note_cto_01',
    authorId: 'emp_cto_01',
    authorName: 'A.R.M Abir Hasan',
    authorRole: 'CTO',
    title: 'The Modular Monolith Principle: Speed, Simplicity & Zero Premature Overhead',
    category: 'System Architecture',
    targetAudience: 'All Developers & PMs',
    executiveSummary:
      'Why Pointfex ERP prioritizes clean bounded contexts in a single deployable artifact before distributing systems.',
    detailedContent:
      'Microservices introduce distributed tracing complexity, partial failures, and event-eventual consistency bugs that slow teams down. By keeping clean directory isolation, explicit DTOs, and single-database transactional integrity, we ship 4x faster while retaining the flexibility to carve out isolated services when compute bounds demand it.',
    takeaways: [
      'Colocate domain services before splitting repos',
      'Never bypass service interfaces with cross-table raw SQL mutations',
      'Every state transition must write an immutable audit log entry',
    ],
    publishedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: 'note_cfo_01',
    authorId: 'emp_cfo_01',
    authorName: 'MD. Ferdous Hasan Rahid',
    authorRole: 'CFO',
    title: 'Prudent Engineering ROI: Treating Cloud Compute as a Core Deliverable Cost',
    category: 'Financial Discipline',
    targetAudience: 'Engineering Leads & Squad PMs',
    executiveSummary:
      'How optimized queries, reduced egress, and efficient caching directly fund squad bonuses and salary growth.',
    detailedContent:
      'Every unindexed database query or redundant API poll incurs direct dollar spend on cloud infrastructure. By optimizing queries from 400ms to 12ms and pruning unnecessary cron triggers, the engineering organization preserves ৳2.4 Lakhs monthly in margin—capital directly recycled into quarterly performance bonuses.',
    takeaways: [
      'Profile queries in staging before merging to main branch',
      'Review cloud resource spend at the start of every sprint planning',
      'Tie performance improvements to quantifiable server cost reductions',
    ],
    publishedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 'note_chro_01',
    authorId: 'emp_chro_01',
    authorName: 'Soyebuzaman Naim',
    authorRole: 'CHRO',
    title: 'Psychological Safety, Blameless Post-Mortems, and Sustained Velocity',
    category: 'People & Culture',
    targetAudience: 'All Pointfex Personnel',
    executiveSummary:
      'High performance thrives on transparent communication, swift error recovery, and zero blame.',
    detailedContent:
      'When an outage or regression occurs, our focus is never on individual fault. It is exclusively on systemic safeguards: Why did CI not catch this? Which automated test was absent? How can our lint rules protect engineers? When engineers feel secure discussing mistakes immediately, incident resolution times drop by over 70%.',
    takeaways: [
      'Report production bugs immediately without fear of reprimand',
      'Conduct post-mortems focused strictly on process and automated gates',
      'Celebrate engineers who proactively identify and refactor vulnerabilities',
    ],
    publishedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: 'note_ceo_01',
    authorId: 'emp_ceo_01',
    authorName: 'Chief Executive Officer',
    authorRole: 'CEO',
    title: 'The 2026 Pointfex Product Standard: High Conviction, Pixel Perfection, Total Reliability',
    category: 'Leadership & Strategy',
    targetAudience: 'Company-Wide',
    executiveSummary:
      'Our organizational ethos is built on delivering enterprise software that never compromises on security, speed, or design.',
    detailedContent:
      'In enterprise software, credibility is binary. If authentication falters, or an audit trail fails to seal, enterprise confidence is lost. Every squad member—from junior developer to C-Suite executive—owns user delight and cryptographic security. We do not ship "good enough"; we ship rock-solid, verified software.',
    takeaways: [
      'Zero broken links, zero silent errors, and zero unhandled exceptions',
      'Every feature must have an automated test proving its correctness',
      'Treat internal tooling with the same design polish as customer-facing apps',
    ],
    publishedAt: new Date(Date.now() - 18 * 86400000).toISOString(),
  },
]

export function CtoConsultancyPage() {
  const { currentUser, data, showToast } = useApp()

  const [activeTab, setActiveTab] = useState<'consultations' | 'executive_notes'>('consultations')

  // Consultation state
  const [consultations, setConsultations] = useState<ConsultationRequest[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONSULTATIONS)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {
      // ignore
    }
    return INITIAL_CONSULTATIONS
  })

  // Executive Notes state
  const [execNotes, setExecNotes] = useState<ExecutiveLearningNote[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_EXEC_NOTES)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {
      // ignore
    }
    return INITIAL_EXEC_NOTES
  })

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CONSULTATIONS, JSON.stringify(consultations))
    } catch {
      // ignore
    }
  }, [consultations])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EXEC_NOTES, JSON.stringify(execNotes))
    } catch {
      // ignore
    }
  }, [execNotes])

  // Modals
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showAdviceModal, setShowAdviceModal] = useState<ConsultationRequest | null>(null)
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false)

  // Filters
  const [consultationFilter, setConsultationFilter] = useState<'all' | 'incoming' | 'outgoing' | 'completed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [noteCategoryFilter, setNoteCategoryFilter] = useState<string>('all')

  // Form states for Request Consultation
  const [targetAdvisorId, setTargetAdvisorId] = useState('')
  const [topic, setTopic] = useState('')
  const [category, setCategory] = useState('System Architecture & Code Review')
  const [reason, setReason] = useState('')
  const [specificQuestions, setSpecificQuestions] = useState('')
  const [priority, setPriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL')

  // Form state for Advice Response
  const [adviceNotes, setAdviceNotes] = useState('')
  const [adviceDecision, setAdviceDecision] = useState<'approve' | 'decline'>('approve')

  // Form state for Create Executive Note
  const [noteTitle, setNoteTitle] = useState('')
  const [noteCategory, setNoteCategory] = useState('System Architecture')
  const [noteTargetAudience, setNoteTargetAudience] = useState('All Pointfex Personnel')
  const [noteSummary, setNoteSummary] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteTakeaways, setNoteTakeaways] = useState('')

  // Determine current user executive authority
  const userRoleLower = (currentUser?.role || '').toLowerCase()
  const isCLevel = ['ceo', 'cto', 'chro', 'cfo', 'cpo'].includes(userRoleLower) || currentUser?.role?.includes('c_level')

  // Colleague options for consultation target (excluding current user)
  const availableColleagues = useMemo(() => {
    const list = data?.users || []
    return list.filter((u) => u.id !== currentUser?.id)
  }, [data?.users, currentUser?.id])

  // Count of incoming requests pending current user's advice
  const incomingPendingCount = useMemo(() => {
    if (!currentUser?.id) return 0
    return consultations.filter(
      (c) => c.advisorId === currentUser.id && c.status === 'PENDING',
    ).length
  }, [consultations, currentUser?.id])

  // Filtered consultations
  const filteredConsultations = useMemo(() => {
    return consultations.filter((c) => {
      // Sub-filter
      if (consultationFilter === 'incoming') {
        if (c.advisorId !== currentUser?.id && !isCLevel) return false
      } else if (consultationFilter === 'outgoing') {
        if (c.requesterId !== currentUser?.id) return false
      } else if (consultationFilter === 'completed') {
        if (c.status !== 'COMPLETED' && c.status !== 'APPROVED') return false
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTopic = c.topic.toLowerCase().includes(q)
        const matchReason = c.reason.toLowerCase().includes(q)
        const matchReq = c.requesterName.toLowerCase().includes(q)
        const matchAdv = c.advisorName.toLowerCase().includes(q)
        const matchNotes = (c.adviceNotes || '').toLowerCase().includes(q)
        if (!matchTopic && !matchReason && !matchReq && !matchAdv && !matchNotes) {
          return false
        }
      }

      return true
    })
  }, [consultations, consultationFilter, searchQuery, currentUser?.id, isCLevel])

  // Filtered executive notes
  const filteredExecNotes = useMemo(() => {
    return execNotes.filter((n) => {
      if (noteCategoryFilter !== 'all' && n.category !== noteCategoryFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = n.title.toLowerCase().includes(q)
        const matchSummary = n.executiveSummary.toLowerCase().includes(q)
        const matchContent = n.detailedContent.toLowerCase().includes(q)
        const matchAuthor = n.authorName.toLowerCase().includes(q)
        if (!matchTitle && !matchSummary && !matchContent && !matchAuthor) return false
      }
      return true
    })
  }, [execNotes, noteCategoryFilter, searchQuery])

  // Submit Request Consultation
  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetAdvisorId) {
      showToast('Please select a colleague / advisor.', 'error')
      return
    }
    if (!topic.trim() || !reason.trim()) {
      showToast('Please provide a topic and reason for the consultation.', 'error')
      return
    }

    const advisor = availableColleagues.find((u) => u.id === targetAdvisorId)
    const newRequest: ConsultationRequest = {
      id: `cons_${Date.now()}`,
      requesterId: currentUser?.id || 'emp_user',
      requesterName: currentUser?.name || 'Anonymous Employee',
      requesterRole: currentUser?.title || currentUser?.role?.toUpperCase() || 'Team Member',
      advisorId: targetAdvisorId,
      advisorName: advisor?.name || 'Selected Colleague',
      advisorRole: advisor?.title || advisor?.role?.toUpperCase() || 'Colleague',
      topic: topic.trim(),
      category,
      reason: reason.trim(),
      specificQuestions: specificQuestions.trim(),
      priority,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    }

    setConsultations((prev) => [newRequest, ...prev])
    setShowRequestModal(false)
    setTopic('')
    setReason('')
    setSpecificQuestions('')
    setTargetAdvisorId('')
    showToast(`Consultation request sent to ${advisor?.name || 'colleague'}.`, 'success')
  }

  // Submit Advice / Thoughts
  const handleSaveAdvice = (e: React.FormEvent) => {
    e.preventDefault()
    if (!showAdviceModal) return
    if (adviceDecision === 'approve' && !adviceNotes.trim()) {
      showToast('Please write your consultation advice / thoughts before submitting.', 'error')
      return
    }

    const updated = consultations.map((item) => {
      if (item.id === showAdviceModal.id) {
        return {
          ...item,
          status: adviceDecision === 'approve' ? ('COMPLETED' as const) : ('DECLINED' as const),
          adviceNotes: adviceNotes.trim(),
          respondedAt: new Date().toISOString(),
        }
      }
      return item
    })

    setConsultations(updated)
    setShowAdviceModal(null)
    setAdviceNotes('')
    showToast(
      adviceDecision === 'approve'
        ? 'Consultation advice shared successfully.'
        : 'Consultation request declined.',
      'info',
    )
  }

  // Submit Executive Learning Note
  const handleCreateExecNote = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isCLevel) {
      showToast('Only C-Suite executives (CEO, CTO, CFO, CHRO) can publish learning notes.', 'error')
      return
    }
    if (!noteTitle.trim() || !noteSummary.trim() || !noteContent.trim()) {
      showToast('Please fill out the note title, summary, and guidance content.', 'error')
      return
    }

    const upperRole = (currentUser?.role || 'CTO').toUpperCase() as 'CEO' | 'CTO' | 'CFO' | 'CHRO' | 'CPO'
    const takeawaysList = noteTakeaways
      .split('\n')
      .map((t) => t.trim().replace(/^[-*•]\s*/, ''))
      .filter(Boolean)

    const newNote: ExecutiveLearningNote = {
      id: `note_${Date.now()}`,
      authorId: currentUser?.id || 'emp_exec',
      authorName: currentUser?.name || 'Executive Officer',
      authorRole: ['CEO', 'CTO', 'CFO', 'CHRO', 'CPO'].includes(upperRole) ? upperRole : 'CTO',
      title: noteTitle.trim(),
      category: noteCategory,
      targetAudience: noteTargetAudience,
      executiveSummary: noteSummary.trim(),
      detailedContent: noteContent.trim(),
      takeaways: takeawaysList.length > 0 ? takeawaysList : ['Verify with automated tests before production release'],
      publishedAt: new Date().toISOString(),
    }

    setExecNotes((prev) => [newNote, ...prev])
    setShowCreateNoteModal(false)
    setNoteTitle('')
    setNoteSummary('')
    setNoteContent('')
    setNoteTakeaways('')
    showToast('Executive learning note published for the organization.', 'success')
  }

  return (
    <div className="space-y-6">
      {/* Modern Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
            <Handshake className="w-5 h-5 text-indigo-500" />
            Advisory, Consultations & Leadership Notes
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Peer-to-peer technical consultation network and executive knowledge guidance from C-Suite leadership
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2.5">
          {activeTab === 'consultations' ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setShowRequestModal(true)}
              className="flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Request Consultation
            </Button>
          ) : isCLevel ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setShowCreateNoteModal(true)}
              className="flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Share Learning Note
            </Button>
          ) : (
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200/70 dark:border-slate-700 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              C-Suite Leadership Notes
            </span>
          )}
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('consultations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'consultations'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100/70 dark:bg-surface-muted'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Peer Consultations & Advice</span>
          {incomingPendingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-400 text-slate-900">
              {incomingPendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('executive_notes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'executive_notes'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100/70 dark:bg-surface-muted'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Executive Learning & Leadership Notes</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
            {execNotes.length}
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: PEER CONSULTATIONS & ADVICE */}
      {/* ==================================================================== */}
      {activeTab === 'consultations' && (
        <div className="space-y-4">
          {/* Controls Bar: Sub-filters & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-surface-muted/80 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                onClick={() => setConsultationFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                  consultationFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All ({consultations.length})
              </button>
              <button
                onClick={() => setConsultationFilter('incoming')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  consultationFilter === 'incoming'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>For Me to Advise</span>
                {incomingPendingCount > 0 && (
                  <span className="px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-amber-500 text-white">
                    {incomingPendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setConsultationFilter('outgoing')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                  consultationFilter === 'outgoing'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                My Requests
              </button>
              <button
                onClick={() => setConsultationFilter('completed')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                  consultationFilter === 'completed'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Answered & Completed
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search consultations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* List of Consultations */}
          {filteredConsultations.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-50/50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <Handshake className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No consultations found
              </div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Any developer or PM can request technical or architectural advice from any colleague in Pointfex ERP.
              </p>
              <Button size="sm" variant="primary" onClick={() => setShowRequestModal(true)}>
                Start First Consultation Request
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredConsultations.map((item) => {
                const isTargetAdvisor = item.advisorId === currentUser?.id || isCLevel
                const isCompleted = item.status === 'COMPLETED' || item.status === 'APPROVED'
                const isDeclined = item.status === 'DECLINED'
                const isPending = item.status === 'PENDING'

                return (
                  <Card key={item.id} className="p-5 space-y-4">
                    {/* Top Row: Meta, Parties, Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Status badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isCompleted
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : isDeclined
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse'
                          }`}
                        >
                          {isCompleted ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> Advice Provided
                            </>
                          ) : isDeclined ? (
                            <>
                              <XCircle className="w-3 h-3" /> Declined
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" /> Awaiting Advisor Thoughts
                            </>
                          )}
                        </span>

                        <span className="text-xs text-slate-400 font-mono">
                          {formatDate(item.createdAt, 'short')}
                        </span>

                        <Badge variant="neutral" size="xs">
                          {item.category}
                        </Badge>

                        {item.priority === 'URGENT' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            Urgent
                          </span>
                        )}
                      </div>

                      {/* Requester -> Advisor arrow indicator */}
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.requesterName}
                        </span>
                        <span className="text-[10px] text-slate-400">({item.requesterRole})</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {item.advisorName}
                        </span>
                        <span className="text-[10px] text-slate-400">({item.advisorRole})</span>
                      </div>
                    </div>

                    {/* Middle: Topic & Context */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                        {item.topic}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                        {item.reason}
                      </p>
                      {item.specificQuestions && (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-surface-muted/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">
                            Specific Discussion Questions:
                          </span>
                          <p className="whitespace-pre-line text-[11px]">{item.specificQuestions}</p>
                        </div>
                      )}
                    </div>

                    {/* Bottom: Advice Response OR Action Button */}
                    {item.adviceNotes ? (
                      <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            Consultation Advice & Thoughts from {item.advisorName} ({item.advisorRole})
                          </span>
                          {item.respondedAt && (
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400/80 font-mono">
                              Answered {formatDate(item.respondedAt, 'short')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                          {item.adviceNotes}
                        </p>
                      </div>
                    ) : isPending && isTargetAdvisor ? (
                      <div className="pt-2 flex items-center justify-between bg-amber-50/40 dark:bg-amber-950/10 p-3 rounded-2xl border border-amber-200/50 dark:border-amber-900/30">
                        <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>
                            You are requested to advise on this issue. Share your thoughts and guidance.
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setShowAdviceModal(item)
                            setAdviceDecision('approve')
                            setAdviceNotes('')
                          }}
                        >
                          Provide Consultation Thoughts
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: EXECUTIVE LEARNING & LEADERSHIP NOTES */}
      {/* ==================================================================== */}
      {activeTab === 'executive_notes' && (
        <div className="space-y-4">
          {/* Executive Header Banner */}
          <div className="p-4 rounded-3xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <BookOpen className="w-5 h-5" />
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                  C-Suite Leadership & Architecture Notes
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Strategic engineering directives, cost-efficiency principles, and operational insights authored exclusively by C-Level executives (CEO, CTO, CFO, CHRO).
              </p>
            </div>

            {isCLevel ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setShowCreateNoteModal(true)}
                className="shrink-0 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Publish Learning Note
              </Button>
            ) : (
              <span className="text-[11px] text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 self-start sm:self-auto font-medium">
                Universal Read-Only Access
              </span>
            )}
          </div>

          {/* Controls: Category Filter & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-surface-muted/80 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                onClick={() => setNoteCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                  noteCategoryFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Pillars ({execNotes.length})
              </button>
              <button
                onClick={() => setNoteCategoryFilter('System Architecture')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                  noteCategoryFilter === 'System Architecture'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Architecture (CTO)
              </button>
              <button
                onClick={() => setNoteCategoryFilter('Financial Discipline')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                  noteCategoryFilter === 'Financial Discipline'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Financial ROI (CFO)
              </button>
              <button
                onClick={() => setNoteCategoryFilter('People & Culture')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                  noteCategoryFilter === 'People & Culture'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                People & Velocity (CHRO)
              </button>
              <button
                onClick={() => setNoteCategoryFilter('Leadership & Strategy')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                  noteCategoryFilter === 'Leadership & Strategy'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Strategy (CEO)
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search executive notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Cards of Executive Learning Notes */}
          <div className="grid grid-cols-1 gap-5">
            {filteredExecNotes.map((note) => {
              const roleColors: Record<string, string> = {
                CEO: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
                CTO: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800',
                CFO: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
                CHRO: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800',
                CPO: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800',
              }
              const roleBadgeClass = roleColors[note.authorRole] || 'bg-slate-100 text-slate-700'

              return (
                <Card key={note.id} className="p-6 space-y-4">
                  {/* Top Bar: Author, Role Badge, Category, Date */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-200 font-display">
                        {note.authorRole}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-xs">
                            {note.authorName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleBadgeClass}`}
                          >
                            {note.authorRole}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          Audience: {note.targetAudience}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="indigo" size="xs">
                        {note.category}
                      </Badge>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {formatDate(note.publishedAt, 'short')}
                      </span>
                    </div>
                  </div>

                  {/* Title & Summary */}
                  <div className="space-y-1.5">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white font-display">
                      {note.title}
                    </h4>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-surface-muted/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 italic">
                      &ldquo;{note.executiveSummary}&rdquo;
                    </p>
                  </div>

                  {/* Detailed Content */}
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                    {note.detailedContent}
                  </p>

                  {/* Key Takeaways */}
                  {note.takeaways && note.takeaways.length > 0 && (
                    <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        Executive Key Takeaways & Standards:
                      </div>
                      <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
                        {note.takeaways.map((point, idx) => (
                          <li key={idx} className="leading-snug">
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: REQUEST CONSULTATION */}
      {/* ==================================================================== */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Handshake className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Request Peer or Executive Consultation
                  </h3>
                  <p className="text-xs text-slate-400">
                    Seek technical advice, architectural insight, or sprint scoping from a colleague
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRequestModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4 text-xs">
              {/* Target Colleague Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Colleague / Advisor *
                </label>
                <select
                  required
                  value={targetAdvisorId}
                  onChange={(e) => setTargetAdvisorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="">-- Choose Colleague to Advise You --</option>
                  {availableColleagues.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.title || u.role?.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Topic & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Consultation Topic *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Neon Serverless Connection Pooling"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Domain / Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="System Architecture & Database">System Architecture & Database</option>
                    <option value="Code Review & Security">Code Review & Security</option>
                    <option value="Performance & Caching">Performance & Caching</option>
                    <option value="Finance & Project Scoping">Finance & Project Scoping</option>
                    <option value="Squad Delivery & Sprint Planning">Squad Delivery & Sprint Planning</option>
                    <option value="Career & Engineering Standards">Career & Engineering Standards</option>
                  </select>
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Urgency Level
                </label>
                <div className="flex items-center gap-3">
                  {(['NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
                    <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="priority"
                        checked={priority === p}
                        onChange={() => setPriority(p)}
                      />
                      <span className="capitalize">{p.toLowerCase()}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Reason / Context */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reason & Background Context *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why you are seeking consultation and what challenge you are resolving..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {/* Specific Questions */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Specific Questions / Key Discussion Points
                </label>
                <textarea
                  rows={2}
                  placeholder="1. How should we configure timeouts?&#10;2. Can we use cached redis session?"
                  value={specificQuestions}
                  onChange={(e) => setSpecificQuestions(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowRequestModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" variant="primary" className="flex items-center gap-1">
                  <Send className="w-3.5 h-3.5" />
                  Submit Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: PROVIDE CONSULTATION THOUGHTS & ADVICE */}
      {/* ==================================================================== */}
      {showAdviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Provide Consultation Thoughts & Advice
                  </h3>
                  <p className="text-xs text-slate-400">
                    Responding to {showAdviceModal.requesterName} ({showAdviceModal.requesterRole})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAdviceModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Request Summary for Reference */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-surface-muted/80 border border-slate-100 dark:border-slate-800 space-y-1 text-xs">
              <div className="font-bold text-slate-900 dark:text-white font-display">
                {showAdviceModal.topic}
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-[11px] whitespace-pre-line">
                {showAdviceModal.reason}
              </p>
            </div>

            <form onSubmit={handleSaveAdvice} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Your Decision
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      checked={adviceDecision === 'approve'}
                      onChange={() => setAdviceDecision('approve')}
                    />
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      Share Consultation Advice
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      checked={adviceDecision === 'decline'}
                      onChange={() => setAdviceDecision('decline')}
                    />
                    <span className="font-medium text-rose-600 dark:text-rose-400">
                      Decline Request
                    </span>
                  </label>
                </div>
              </div>

              {adviceDecision === 'approve' ? (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Your Consultation Thoughts, Guidance & Recommendations *
                  </label>
                  <textarea
                    required
                    rows={5}
                    placeholder="Provide your in-depth recommendations, architectural guidance, code tips, or links to references..."
                    value={adviceNotes}
                    onChange={(e) => setAdviceNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Reason for Declining (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Schedule conflicts or out of current domain expertise..."
                    value={adviceNotes}
                    onChange={(e) => setAdviceNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowAdviceModal(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  variant={adviceDecision === 'approve' ? 'primary' : 'danger'}
                >
                  {adviceDecision === 'approve' ? 'Submit Consultation Advice' : 'Confirm Decline'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: PUBLISH EXECUTIVE LEARNING NOTE (C-SUITE ONLY) */}
      {/* ==================================================================== */}
      {showCreateNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Publish Executive Learning Note
                  </h3>
                  <p className="text-xs text-slate-400">
                    Share strategic engineering, financial, or leadership principles across Pointfex
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateNoteModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExecNote} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Note Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Architectural Rigor & Zero Premature Microservices"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Leadership Pillar / Category
                  </label>
                  <select
                    value={noteCategory}
                    onChange={(e) => setNoteCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="System Architecture">System Architecture (CTO)</option>
                    <option value="Financial Discipline">Financial Discipline (CFO)</option>
                    <option value="People & Culture">People & Culture (CHRO)</option>
                    <option value="Leadership & Strategy">Leadership & Strategy (CEO)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Target Audience
                  </label>
                  <input
                    type="text"
                    value={noteTargetAudience}
                    onChange={(e) => setNoteTargetAudience(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Executive Summary / Core Thesis *
                </label>
                <input
                  type="text"
                  required
                  placeholder="A concise 1-2 sentence high-level principle..."
                  value={noteSummary}
                  onChange={(e) => setNoteSummary(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Detailed Guidance & Insights *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Explain the background, why this standard matters, and how squads should implement it..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Key Takeaways (One per line)
                </label>
                <textarea
                  rows={3}
                  placeholder="• Write unit tests before merging&#10;• Profile slow queries on staging&#10;• Prioritize user data integrity"
                  value={noteTakeaways}
                  onChange={(e) => setNoteTakeaways(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowCreateNoteModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" variant="primary" className="flex items-center gap-1">
                  <Send className="w-3.5 h-3.5" />
                  Publish Note
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CtoConsultancyPage
