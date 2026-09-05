import { FormEvent, ReactNode, useMemo, useState } from 'react'

type IconName =
  | 'spark'
  | 'heart'
  | 'message'
  | 'leaf'
  | 'water'
  | 'pool'
  | 'spa'
  | 'steam'
  | 'massage'
  | 'yoga'
  | 'book'
  | 'garden'
  | 'fish'
  | 'bed'
  | 'user'
  | 'phone'
  | 'mail'
  | 'pin'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'zalo'
  | 'arrow'
  | 'check'
  | 'shield'

const Icon = ({ name, size = 22 }: { name: IconName; size?: number }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  const paths: Record<IconName, ReactNode> = {
    spark: <><path d="M12 2l1.8 5.1L19 9l-5.2 1.9L12 16l-1.8-5.1L5 9l5.2-1.9L12 2Z"/><path d="M19 16l.9 2.5L22.5 20l-2.6 1-.9 2.5-.9-2.5-2.6-1 2.6-1 .9-2.5Z"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8M8 13h5"/></>,
    leaf: <><path d="M20 4c-8 0-14 4-14 10 0 3 2 5 5 5 6 0 9-7 9-15Z"/><path d="M4 21c2-5 6-8 12-11"/></>,
    water: <><path d="M2 8c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/><path d="M2 13c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/><path d="M2 18c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/></>,
    pool: <><path d="M2 15c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/><path d="M2 20c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/><path d="M6 13V6a2 2 0 0 1 4 0M10 9h6V6a2 2 0 0 1 4 0"/></>,
    spa: <><path d="M12 22c4-3 6-6 6-10-3 0-5 1-6 3-1-2-3-3-6-3 0 4 2 7 6 10Z"/><path d="M12 15c-2-2-3-5 0-9 3 4 2 7 0 9Z"/></>,
    steam: <><path d="M8 3c2 2-2 4 0 6s-2 4 0 6"/><path d="M16 3c2 2-2 4 0 6s-2 4 0 6"/><path d="M4 20h16"/></>,
    massage: <><circle cx="12" cy="5" r="2"/><path d="M6 11c2-2 4-3 6-3s4 1 6 3M8 20l2-7 2 3 2-3 2 7"/></>,
    yoga: <><circle cx="12" cy="4" r="2"/><path d="M12 6v6M7 9l5 3 5-3M5 20l7-8 7 8M9 20h6"/></>,
    book: <><path d="M4 5a3 3 0 0 1 3-3h5v18H7a3 3 0 0 0-3 3Z"/><path d="M20 5a3 3 0 0 0-3-3h-5v18h5a3 3 0 0 1 3 3Z"/></>,
    garden: <><path d="M12 22V10"/><path d="M12 14c-5 0-7-3-7-7 5 0 7 3 7 7ZM12 10c5 0 7-3 7-7-5 0-7 3-7 7Z"/></>,
    fish: <><path d="M4 12c3-5 8-6 13-2l4-3v10l-4-3c-5 4-10 3-13-2Z"/><circle cx="14" cy="11" r=".7" fill="currentColor"/></>,
    bed: <><path d="M3 20v-9M21 20v-7a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v3"/><path d="M3 16h18M6 10V7h4v3"/></>,
    user: <><circle cx="12" cy="7" r="4"/><path d="M4 22c0-5 3-8 8-8s8 3 8 8"/></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .4 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z"/>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    facebook: <><circle cx="12" cy="12" r="9"/><path d="M13.5 8H15V5.5h-2c-2 0-3 1.2-3 3V11H8v2.5h2V19h3v-5.5h2.2l.4-2.5H13V9c0-.7.2-1 1-1Z"/></>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></>,
    tiktok: <><path d="M15 4v10a4 4 0 1 1-4-4"/><path d="M15 4c1 3 3 4 6 4"/></>,
    youtube: <><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/></>,
    zalo: <><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M7 9h4l-4 6h4M13 15V9h3c2 0 2 3 0 3h-3M18 9v6"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  }

  return <svg {...common}>{paths[name]}</svg>
}

type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  text: string
}

const suggestions = [
  'Tôi đang cảm thấy căng thẳng',
  'Tôi muốn hiểu cảm xúc của mình',
  'Tôi đang gặp vấn đề trong một mối quan hệ',
]

const getMockResponse = (message: string): string => {
  const normalized = message.toLowerCase()

  if (normalized.includes('căng thẳng') || normalized.includes('stress')) {
    return 'Mình nghe thấy bạn đang phải mang khá nhiều áp lực. Trước khi tìm cách giải quyết, bạn có thể kể cho mình biết điều gì đang khiến bạn căng thẳng nhất lúc này không?'
  }

  if (normalized.includes('cảm xúc') || normalized.includes('buồn')) {
    return 'Có vẻ bạn đang muốn hiểu rõ hơn điều đang diễn ra bên trong mình. Nếu chọn một cảm xúc nổi bật nhất ngay lúc này, bạn nghĩ đó là cảm xúc nào — và bạn thường cảm nhận nó rõ nhất ở thời điểm nào?'
  }

  if (normalized.includes('mối quan hệ') || normalized.includes('gia đình') || normalized.includes('người yêu')) {
    return 'Mối quan hệ thường có nhiều lớp: điều đã xảy ra, cảm xúc của bạn, điều bạn cần và điều bạn đang sợ mất đi. Bạn muốn bắt đầu từ chuyện vừa xảy ra gần đây nhất không?'
  }

  return 'Cảm ơn bạn đã chia sẻ. Mình sẽ không vội đưa ra kết luận. Bạn có thể nói thêm một chút về điều khiến chuyện này quan trọng với bạn lúc này không?'
}

const services: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: 'heart', title: 'Lắng nghe & thấu hiểu', text: 'Một không gian đủ an toàn để bạn nói ra điều đang khó nói, theo nhịp độ của chính mình.' },
  { icon: 'spark', title: 'Khám phá bản thân', text: 'Cùng nhìn lại cảm xúc, suy nghĩ, mối quan hệ và những mẫu hình đang lặp lại trong cuộc sống.' },
  { icon: 'user', title: 'Người dẫn đồng hành', text: 'Khi cần đi sâu hơn, INSPIRE kết nối bạn với người dẫn hoặc chuyên gia phù hợp.' },
]

const resortFeatures: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: 'bed', title: 'Phòng nghỉ', text: 'Không gian riêng tư, nhẹ nhàng và hiện đại.' },
  { icon: 'pool', title: 'Hồ bơi', text: 'Thư giãn giữa thiên nhiên và ánh sáng ven sông.' },
  { icon: 'spa', title: 'Spa', text: 'Khoảng thời gian dành riêng cho cơ thể và sự hồi phục.' },
  { icon: 'steam', title: 'Xông hơi', text: 'Không gian khô và ướt để nghỉ ngơi sâu hơn.' },
  { icon: 'massage', title: 'Massage', text: 'Thư giãn cơ thể và giảm bớt căng thẳng tích tụ.' },
  { icon: 'yoga', title: 'Thiền & Yoga', text: 'Trở về với hơi thở, sự chú ý và nhịp điệu cơ thể.' },
  { icon: 'book', title: 'Góc đọc sách', text: 'Một nơi yên tĩnh để đọc, suy ngẫm và ở cùng chính mình.' },
  { icon: 'garden', title: 'Sân vườn', text: 'Đi bộ chậm, nghỉ dưới bóng cây và kết nối với thiên nhiên.' },
  { icon: 'fish', title: 'Hồ cá', text: 'Một góc tĩnh lặng cho những phút giây không cần vội.' },
  { icon: 'water', title: 'Không gian ven sông', text: 'Gió, nước và khoảng mở tạo nên nhịp nghỉ tự nhiên.' },
  { icon: 'message', title: 'Tham vấn riêng', text: 'Không gian riêng biệt dành cho cuộc trò chuyện cần chiều sâu.' },
]

const socialLinks: Array<{ icon: IconName; label: string; value: string }> = [
  { icon: 'facebook', label: 'Facebook', value: '@inspire.placeholder' },
  { icon: 'instagram', label: 'Instagram', value: '@inspire.placeholder' },
  { icon: 'tiktok', label: 'TikTok', value: '@inspire.placeholder' },
  { icon: 'youtube', label: 'YouTube', value: 'INSPIRE' },
  { icon: 'zalo', label: 'Zalo', value: '0xxx xxx xxx' },
]

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'assistant',
      text: 'Chào bạn, mình là AI hỗ trợ của INSPIRE. Đây hiện là bản mô phỏng. Bạn muốn bắt đầu với điều gì đang ở trong đầu mình hôm nay?',
    },
  ])
  const [input, setInput] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const lastId = useMemo(() => messages[messages.length - 1]?.id ?? 0, [messages])

  const sendMessage = (text: string) => {
    const clean = text.trim()
    if (!clean) return

    const userMessage: ChatMessage = { id: lastId + 1, role: 'user', text: clean }
    const assistantMessage: ChatMessage = {
      id: lastId + 2,
      role: 'assistant',
      text: getMockResponse(clean),
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setInput('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    sendMessage(input)
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMobileMenuOpen(false)
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <button className="brand" onClick={() => scrollTo('home')} aria-label="Về đầu trang">
          <span className="brand-mark"><Icon name="leaf" size={21} /></span>
          <span className="brand-copy">
            <strong>INSPIRE</strong>
            <small>Tham vấn · Nghỉ dưỡng</small>
          </span>
        </button>

        <nav className={`main-nav ${mobileMenuOpen ? 'open' : ''}`}>
          <button onClick={() => scrollTo('counseling')}>Tham vấn</button>
          <button onClick={() => scrollTo('ai-chat')}>AI INSPIRE</button>
          <button onClick={() => scrollTo('resort')}>Nghỉ dưỡng</button>
          <button onClick={() => scrollTo('contact')}>Liên hệ</button>
        </nav>

        <div className="header-actions">
          <button className="text-btn desktop-only" onClick={() => scrollTo('pricing')}>Chi phí</button>
          <button className="primary-btn compact" onClick={() => scrollTo('booking')}>Đặt lịch</button>
          <button className="menu-btn" onClick={() => setMobileMenuOpen((v) => !v)} aria-label="Mở menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-glow hero-glow-one"></div>
          <div className="hero-glow hero-glow-two"></div>
          <div className="hero-content">
            <div className="eyebrow"><Icon name="spark" size={16}/> Không gian để hiểu mình sâu hơn</div>
            <h1>
              Khi bạn cần một nơi<br />
              <span>để dừng lại, lắng nghe và chuyển mình.</span>
            </h1>
            <p>
              INSPIRE kết hợp tham vấn, công nghệ hỗ trợ và một không gian nghỉ dưỡng ven sông —
              để việc chăm sóc tinh thần không chỉ diễn ra trong một cuộc trò chuyện, mà trong cả trải nghiệm sống.
            </p>
            <div className="hero-actions">
              <button className="primary-btn" onClick={() => scrollTo('counseling')}>
                Khám phá INSPIRE <Icon name="arrow" size={18}/>
              </button>
              <button className="secondary-btn" onClick={() => scrollTo('ai-chat')}>
                Thử trò chuyện AI
              </button>
            </div>
            <div className="hero-trust">
              <span><Icon name="shield" size={17}/> Không thay thế chẩn đoán y khoa</span>
              <span><Icon name="heart" size={17}/> Tôn trọng riêng tư & giới hạn</span>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="visual-card main-card">
              <span className="mini-label">INSPIRE</span>
              <h3>Một nơi giữa<br/>con người & thiên nhiên.</h3>
              <div className="river-art">
                <div className="sun"></div>
                <div className="tree tree-one"></div>
                <div className="tree tree-two"></div>
                <div className="river-wave wave-one"></div>
                <div className="river-wave wave-two"></div>
              </div>
            </div>
            <div className="visual-card floating-card top-card">
              <Icon name="message" size={19}/>
              <span>Tham vấn riêng</span>
            </div>
            <div className="visual-card floating-card bottom-card">
              <Icon name="water" size={19}/>
              <span>Nghỉ dưỡng ven sông</span>
            </div>
          </div>
        </section>

        <section className="section counseling" id="counseling">
          <div className="section-heading split-heading">
            <div>
              <div className="eyebrow">01 · THAM VẤN INSPIRE</div>
              <h2>Không chỉ để “giải quyết vấn đề”.<br/>Mà để hiểu điều đang diễn ra bên trong bạn.</h2>
            </div>
            <p>
              INSPIRE tạo một không gian đồng hành giữa con người, người dẫn/chuyên gia và công nghệ hỗ trợ.
              AI có thể giúp bạn bắt đầu, còn những vấn đề cần chiều sâu sẽ có con người thật tiếp tục đồng hành.
            </p>
          </div>

          <div className="service-grid">
            {services.map((service) => (
              <article className="service-card" key={service.title}>
                <div className="icon-box"><Icon name={service.icon}/></div>
                <h3>{service.title}</h3>
                <p>{service.text}</p>
              </article>
            ))}
          </div>

          <div className="flow-panel">
            <div className="flow-copy">
              <span className="mini-label">MÔ HÌNH ĐỒNG HÀNH</span>
              <h3>Công nghệ mở đầu. Con người giữ chiều sâu.</h3>
              <p>
                Bạn có thể bắt đầu nhẹ nhàng với AI, sau đó lựa chọn tiếp tục với người dẫn/chuyên gia khi cần.
                Mục tiêu là tạo một hành trình linh hoạt, không ép buộc và phù hợp với từng người.
              </p>
              <button className="link-btn" onClick={() => scrollTo('booking')}>Đặt lịch với người dẫn <Icon name="arrow" size={17}/></button>
            </div>
            <div className="flow-steps">
              {[
                ['01', 'Bắt đầu', 'Trò chuyện hoặc chia sẻ nhu cầu ban đầu.'],
                ['02', 'Hiểu rõ hơn', 'AI hỗ trợ sắp xếp thông tin và gợi mở câu hỏi.'],
                ['03', 'Kết nối', 'Chọn người dẫn/chuyên gia khi bạn cần chiều sâu.'],
                ['04', 'Đồng hành', 'Theo dõi quá trình và lựa chọn bước tiếp theo.'],
              ].map(([num, title, text]) => (
                <div className="flow-step" key={num}>
                  <span>{num}</span>
                  <div><strong>{title}</strong><p>{text}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section chat-section" id="ai-chat">
          <div className="chat-intro">
            <div className="eyebrow light">02 · AI INSPIRE · BẢN MÔ PHỎNG</div>
            <h2>Bắt đầu bằng một cuộc trò chuyện đơn giản.</h2>
            <p>
              Đây là giao diện mô phỏng để bạn thay AI thật sau này. Hiện tại phản hồi được tạo từ các mẫu có sẵn ngay trong TypeScript — không gọi bất kỳ API nào.
            </p>
            <ul className="feature-list">
              <li><Icon name="check" size={17}/> Giao diện chat đã tương tác được</li>
              <li><Icon name="check" size={17}/> Có câu hỏi gợi ý để bắt đầu</li>
              <li><Icon name="check" size={17}/> Dễ thay bằng backend/LLM API sau</li>
            </ul>
          </div>

          <div className="chat-window">
            <div className="chat-header">
              <div className="chat-avatar"><Icon name="spark" size={19}/></div>
              <div><strong>AI INSPIRE</strong><span><i></i> Bản mô phỏng đang hoạt động</span></div>
              <span className="beta-pill">DEMO</span>
            </div>
            <div className="chat-messages">
              {messages.map((message) => (
                <div key={message.id} className={`message-row ${message.role}`}>
                  {message.role === 'assistant' && <div className="message-avatar"><Icon name="leaf" size={15}/></div>}
                  <div className="message-bubble">{message.text}</div>
                </div>
              ))}
            </div>
            <div className="suggestion-row">
              {suggestions.map((suggestion) => (
                <button key={suggestion} onClick={() => sendMessage(suggestion)}>{suggestion}</button>
              ))}
            </div>
            <form className="chat-input" onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Chia sẻ điều bạn đang nghĩ..."
                aria-label="Tin nhắn cho AI INSPIRE"
              />
              <button type="submit" aria-label="Gửi tin nhắn"><Icon name="arrow" size={18}/></button>
            </form>
            <p className="chat-note">AI chỉ hỗ trợ thông tin ban đầu và không thay thế bác sĩ hoặc chuyên gia có thẩm quyền.</p>
          </div>
        </section>

        <section className="section pricing-section" id="pricing">
          <div className="section-heading centered">
            <div className="eyebrow">THAM KHẢO DỊCH VỤ</div>
            <h2>Bạn có thể bắt đầu theo cách phù hợp với mình.</h2>
            <p>Các mức giá dưới đây đang là placeholder để bạn thay sau khi chốt mô hình vận hành.</p>
          </div>

          <div className="pricing-grid">
            <article className="price-card">
              <span className="price-label">BẮT ĐẦU</span>
              <h3>AI INSPIRE</h3>
              <div className="price">Miễn phí <small>/ demo</small></div>
              <p>Dành cho bước chia sẻ và định hướng ban đầu.</p>
              <ul><li><Icon name="check" size={16}/> Trò chuyện AI</li><li><Icon name="check" size={16}/> Gợi mở câu hỏi</li><li><Icon name="check" size={16}/> Định hướng bước tiếp theo</li></ul>
              <button className="secondary-btn full" onClick={() => scrollTo('ai-chat')}>Trò chuyện ngay</button>
            </article>

            <article className="price-card featured">
              <span className="price-label">ĐƯỢC LỰA CHỌN</span>
              <h3>Tham vấn riêng</h3>
              <div className="price">XXX.000đ <small>/ buổi</small></div>
              <p>Một cuộc trò chuyện riêng với người dẫn/chuyên gia.</p>
              <ul><li><Icon name="check" size={16}/> Không gian riêng tư</li><li><Icon name="check" size={16}/> 1–1 với người dẫn</li><li><Icon name="check" size={16}/> Theo dõi tiến trình</li></ul>
              <button className="primary-btn full" onClick={() => scrollTo('booking')}>Đặt lịch</button>
            </article>

            <article className="price-card">
              <span className="price-label">TRẢI NGHIỆM</span>
              <h3>INSPIRE Retreat</h3>
              <div className="price">Liên hệ <small>/ gói</small></div>
              <p>Kết hợp nghỉ dưỡng, chăm sóc cơ thể và không gian tinh thần.</p>
              <ul><li><Icon name="check" size={16}/> Nghỉ dưỡng ven sông</li><li><Icon name="check" size={16}/> Wellness facilities</li><li><Icon name="check" size={16}/> Có thể kết hợp tham vấn</li></ul>
              <button className="secondary-btn full" onClick={() => scrollTo('contact')}>Nhận tư vấn</button>
            </article>
          </div>
        </section>

        <section className="resort-hero" id="resort">
          <div className="resort-overlay"></div>
          <div className="resort-copy">
            <div className="eyebrow light">03 · INSPIRE BÊN DÒNG SÔNG</div>
            <h2>Một nơi để cơ thể chậm lại,<br/>và tâm trí có thêm khoảng trống.</h2>
            <p>
              INSPIRE được hình dung như một không gian nghỉ dưỡng hiện đại bên sông: nhiều cây xanh, ánh sáng tự nhiên,
              các khoảng mở và những trải nghiệm chăm sóc được thiết kế để bạn thực sự rời khỏi nhịp sống quá nhanh.
            </p>
            <button className="glass-btn" onClick={() => scrollTo('resort-features')}>Khám phá không gian <Icon name="arrow" size={18}/></button>
          </div>
          <div className="resort-stat-panel">
            <div><strong>Ven sông</strong><span>Không gian mở & tự nhiên</span></div>
            <div><strong>Hiện đại</strong><span>Tối giản, ấm và riêng tư</span></div>
            <div><strong>Đa trải nghiệm</strong><span>Nghỉ · hồi phục · tham vấn</span></div>
          </div>
        </section>

        <section className="section resort-features" id="resort-features">
          <div className="section-heading split-heading">
            <div>
              <div className="eyebrow">TRẢI NGHIỆM TẠI INSPIRE</div>
              <h2>Một hệ sinh thái nhỏ cho việc nghỉ ngơi và hồi phục.</h2>
            </div>
            <p>
              Không gian được tổ chức để mỗi người có thể chọn mức độ kết nối phù hợp: ở riêng, vận động nhẹ,
              thư giãn cơ thể, đọc sách, trò chuyện hoặc đơn giản là ngồi cạnh dòng nước.
            </p>
          </div>
          <div className="resort-grid">
            {resortFeatures.map((feature) => (
              <article className="resort-card" key={feature.title}>
                <div className="icon-box soft"><Icon name={feature.icon}/></div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="booking-section" id="booking">
          <div className="booking-card">
            <div>
              <div className="eyebrow">ĐẶT LỊCH</div>
              <h2>Bắt đầu bằng một cuộc gặp phù hợp với bạn.</h2>
              <p>Form này là giao diện demo. Sau này bạn có thể nối với hệ thống đặt lịch, thanh toán và quản lý chuyên gia.</p>
            </div>
            <form className="booking-form" onSubmit={(e) => e.preventDefault()}>
              <label>Họ và tên<input placeholder="Nguyễn Văn A" /></label>
              <label>Số điện thoại<input placeholder="0xxx xxx xxx" /></label>
              <label>Dịch vụ
                <select defaultValue="">
                  <option value="" disabled>Chọn dịch vụ</option>
                  <option>Tham vấn riêng</option>
                  <option>Nghỉ dưỡng INSPIRE</option>
                  <option>Tham vấn + nghỉ dưỡng</option>
                </select>
              </label>
              <label>Ghi chú<textarea placeholder="Bạn muốn INSPIRE biết điều gì trước cuộc hẹn?" rows={3}></textarea></label>
              <button className="primary-btn full" type="button">Tiếp tục đặt lịch</button>
              <span className="form-note">Thanh toán trực tuyến sẽ được tích hợp ở phiên bản sau.</span>
            </form>
          </div>
        </section>

        <section className="section contact-section" id="contact">
          <div className="contact-copy">
            <div className="eyebrow">04 · LIÊN HỆ INSPIRE</div>
            <h2>Khi bạn muốn hỏi thêm,<br/>hãy bắt đầu từ đây.</h2>
            <p>
              Toàn bộ thông tin hiện là placeholder để bạn thay sau. Tôi đã bố trí sẵn các kênh chính để khi có tài khoản thật,
              bạn chỉ cần thay link và nội dung.
            </p>

            <div className="contact-info">
              <a href="#" onClick={(e) => e.preventDefault()}><span><Icon name="phone"/></span><div><small>Điện thoại</small><strong>0xxx xxx xxx</strong></div></a>
              <a href="#" onClick={(e) => e.preventDefault()}><span><Icon name="mail"/></span><div><small>Email</small><strong>hello@inspire.vn</strong></div></a>
              <a href="#" onClick={(e) => e.preventDefault()}><span><Icon name="pin"/></span><div><small>Địa chỉ</small><strong>Địa chỉ INSPIRE sẽ cập nhật sau</strong></div></a>
            </div>
          </div>

          <div className="social-panel">
            <span className="mini-label">MẠNG XÃ HỘI</span>
            <h3>Kết nối với INSPIRE</h3>
            <div className="social-list">
              {socialLinks.map((social) => (
                <a href="#" onClick={(e) => e.preventDefault()} key={social.label}>
                  <span className="social-icon"><Icon name={social.icon}/></span>
                  <div><strong>{social.label}</strong><small>{social.value}</small></div>
                  <Icon name="arrow" size={17}/>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-brand"><span className="brand-mark"><Icon name="leaf" size={21}/></span><div><strong>INSPIRE</strong><small>Tham vấn · Nghỉ dưỡng · Kết nối</small></div></div>
        <p>© {new Date().getFullYear()} INSPIRE. Nội dung và thông tin liên hệ đang ở phiên bản mẫu.</p>
        <div className="footer-links"><button onClick={() => scrollTo('counseling')}>Tham vấn</button><button onClick={() => scrollTo('resort')}>Nghỉ dưỡng</button><button onClick={() => scrollTo('contact')}>Liên hệ</button></div>
      </footer>
    </div>
  )
}

export default App
