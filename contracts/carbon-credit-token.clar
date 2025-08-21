;; NetZero Network Carbon Credit Token Contract
;; Clarity v2
;; Implements minting, burning, transferring, staking, and metadata for carbon credits

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INSUFFICIENT-STAKE u102)
(define-constant ERR-MAX-SUPPLY-REACHED u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-INVALID-BATCH u107)
(define-constant ERR-METADATA-FROZEN u108)
(define-constant ERR-EMERGENCY-LOCK u109)

;; Token metadata
(define-constant TOKEN-NAME "NetZero Carbon Credit")
(define-constant TOKEN-SYMBOL "NZCC")
(define-constant TOKEN-DECIMALS u6)
(define-constant MAX-SUPPLY u1000000000000) ;; 1B credits (decimals accounted separately)

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var emergency-lock bool false)
(define-data-var total-supply uint u0)
(define-data-var metadata-frozen bool false)

;; Balances and stakes
(define-map balances principal uint)
(define-map staked-balances principal uint)
(define-map credit-metadata uint { project-id: uint, origin: (string-ascii 100), issuance-date: uint })

;; Event logging for transparency
(define-data-var last-event-id uint u0)
(define-map events uint { event-type: (string-ascii 20), sender: principal, amount: uint, recipient: (optional principal), timestamp: uint })

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: ensure not emergency locked
(define-private (ensure-not-locked)
  (asserts! (not (var-get emergency-lock)) (err ERR-EMERGENCY-LOCK))
)

;; Private helper: log event
(define-private (log-event (event-type (string-ascii 20)) (amount uint) (recipient (optional principal)))
  (let ((event-id (+ (var-get last-event-id) u1)))
    (map-set events event-id { event-type: event-type, sender: tx-sender, amount: amount, recipient: recipient, timestamp: block-height })
    (var-set last-event-id event-id)
    (ok event-id)
  )
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (try! (log-event "admin-transfer" u0 none))
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (try! (log-event (if pause "paused" "unpaused") u0 none))
    (ok pause)
  )
)

;; Emergency lock/unlock (disables all user actions)
(define-public (set-emergency-lock (lock bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set emergency-lock lock)
    (try! (log-event (if lock "locked" "unlocked") u0 none))
    (ok lock)
  )
)

;; Set metadata for a batch of credits
(define-public (set-credit-metadata (credit-id uint) (project-id uint) (origin (string-ascii 100)) (issuance-date uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (var-get metadata-frozen)) (err ERR-METADATA-FROZEN))
    (map-set credit-metadata credit-id { project-id: project-id, origin: origin, issuance-date: issuance-date })
    (try! (log-event "metadata-set" credit-id none))
    (ok true)
  )
)

;; Freeze metadata to prevent further changes
(define-public (freeze-metadata)
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set metadata-frozen true)
    (try! (log-event "metadata-frozen" u0 none))
    (ok true)
  )
)

;; Mint new carbon credits
(define-public (mint (recipient principal) (amount uint) (project-id uint) (origin (string-ascii 100)) (issuance-date uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (ensure-not-locked)
    (let ((new-supply (+ (var-get total-supply) amount)))
      (asserts! (<= new-supply MAX-SUPPLY) (err ERR-MAX-SUPPLY-REACHED))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (var-set total-supply new-supply)
      (try! (set-credit-metadata (var-get total-supply) project-id origin issuance-date))
      (try! (log-event "mint" amount (some recipient)))
      (ok true)
    )
  )
)

;; Batch mint for efficiency
(define-public (batch-mint (recipients (list 100 { recipient: principal, amount: uint, project-id: uint, origin: (string-ascii 100), issuance-date: uint })))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> (len recipients) u0) (err ERR-INVALID-BATCH))
    (ensure-not-locked)
    (fold batch-mint-iter recipients (ok true))
  )
)

;; Private helper: batch mint iterator
(define-private (batch-mint-iter (entry { recipient: principal, amount: uint, project-id: uint, origin: (string-ascii 100), issuance-date: uint }) (previous (response bool uint)))
  (match previous
    success
    (let ((new-supply (+ (var-get total-supply) (get amount entry))))
      (asserts! (<= new-supply MAX-SUPPLY) (err ERR-MAX-SUPPLY-REACHED))
      (asserts! (not (is-eq (get recipient entry) 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
      (asserts! (> (get amount entry) u0) (err ERR-INVALID-AMOUNT))
      (map-set balances (get recipient entry) (+ (get amount entry) (default-to u0 (map-get? balances (get recipient entry)))))
      (var-set total-supply new-supply)
      (try! (set-credit-metadata (var-get total-supply) (get project-id entry) (get origin entry) (get issuance-date entry)))
      (try! (log-event "batch-mint" (get amount entry) (some (get recipient entry))))
      (ok true)
    )
    error (err error)
  )
)

;; Burn carbon credits
(define-public (burn (amount uint))
  (begin
    (ensure-not-paused)
    (ensure-not-locked)
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
      (map-set balances tx-sender (- balance amount))
      (var-set total-supply (- (var-get total-supply) amount))
      (try! (log-event "burn" amount none))
      (ok true)
    )
  )
)

;; Transfer carbon credits
(define-public (transfer (recipient principal) (amount uint))
  (begin
    (ensure-not-paused)
    (ensure-not-locked)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((sender-balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= sender-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- sender-balance amount))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (try! (log-event "transfer" amount (some recipient)))
      (ok true)
    )
  )
)

;; Batch transfer for efficiency
(define-public (batch-transfer (transfers (list 100 { recipient: principal, amount: uint })))
  (begin
    (ensure-not-paused)
    (ensure-not-locked)
    (asserts! (> (len transfers) u0) (err ERR-INVALID-BATCH))
    (fold batch-transfer-iter transfers (ok true))
  )
)

;; Private helper: batch transfer iterator
(define-private (batch-transfer-iter (entry { recipient: principal, amount: uint }) (previous (response bool uint)))
  (match previous
    success
    (let ((sender-balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (not (is-eq (get recipient entry) 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
      (asserts! (> (get amount entry) u0) (err ERR-INVALID-AMOUNT))
      (asserts! (>= sender-balance (get amount entry)) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- sender-balance (get amount entry)))
      (map-set balances (get recipient entry) (+ (get amount entry) (default-to u0 (map-get? balances (get recipient entry)))))
      (try! (log-event "batch-transfer" (get amount entry) (some (get recipient entry))))
      (ok true)
    )
    error (err error)
  )
)

;; Stake tokens for governance or rewards
(define-public (stake (amount uint))
  (begin
    (ensure-not-paused)
    (ensure-not-locked)
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
      (map-set balances tx-sender (- balance amount))
      (map-set staked-balances tx-sender (+ amount (default-to u0 (map-get? staked-balances tx-sender))))
      (try! (log-event "stake" amount none))
      (ok true)
    )
  )
)

;; Unstake tokens
(define-public (unstake (amount uint))
  (begin
    (ensure-not-paused)
    (ensure-not-locked)
    (let ((stake-balance (default-to u0 (map-get? staked-balances tx-sender))))
      (asserts! (>= stake-balance amount) (err ERR-INSUFFICIENT-STAKE))
      (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
      (map-set staked-balances tx-sender (- stake-balance amount))
      (map-set balances tx-sender (+ amount (default-to u0 (map-get? balances tx-sender))))
      (try! (log-event "unstake" amount none))
      (ok true)
    )
  )
)

;; Read-only: get balance
(define-read-only (get-balance (account principal))
  (ok (default-to u0 (map-get? balances account)))
)

;; Read-only: get staked balance
(define-read-only (get-staked (account principal))
  (ok (default-to u0 (map-get? staked-balances account)))
)

;; Read-only: get total supply
(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: check if emergency locked
(define-read-only (is-emergency-locked)
  (ok (var-get emergency-lock))
)

;; Read-only: get credit metadata
(define-read-only (get-credit-metadata (credit-id uint))
  (ok (default-to { project-id: u0, origin: "", issuance-date: u0 } (map-get? credit-metadata credit-id)))
)

;; Read-only: get event by ID
(define-read-only (get-event (event-id uint))
  (ok (default-to { event-type: "", sender: tx-sender, amount: u0, recipient: none, timestamp: u0 } (map-get? events event-id)))
)