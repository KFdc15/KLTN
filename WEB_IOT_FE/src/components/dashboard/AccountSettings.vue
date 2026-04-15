<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '../../store/authStore'

const router = useRouter()
const auth = useAuthStore()

const fullName = ref(auth.user?.fullName ?? '')
const savingProfile = ref(false)

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const savingPassword = ref(false)

const passwordMismatch = computed(() => {
	if (!newPassword.value && !confirmPassword.value) return false
	return newPassword.value !== confirmPassword.value
})

async function saveProfile() {
	auth.clearError()
	const name = fullName.value.trim()
	if (!name) {
		auth.setError('Full name is required')
		return
	}

	savingProfile.value = true
	try {
		const ok = await auth.updateFullName(name)
		if (!ok) return
	} finally {
		savingProfile.value = false
	}
}

async function savePassword() {
	auth.clearError()
	if (!currentPassword.value || !newPassword.value) {
		auth.setError('Please enter current and new password')
		return
	}
	if (newPassword.value.length < 6) {
		auth.setError('Password must be at least 6 characters')
		return
	}
	if (passwordMismatch.value) {
		auth.setError('New passwords do not match')
		return
	}

	savingPassword.value = true
	try {
		const ok = await auth.changePassword(currentPassword.value, newPassword.value)
		if (!ok) return
		currentPassword.value = ''
		newPassword.value = ''
		confirmPassword.value = ''
	} finally {
		savingPassword.value = false
	}
}

async function deleteAccount() {
	const ok = window.confirm('This will permanently delete your account and all devices. Continue?')
	if (!ok) return

	auth.clearError()
	const deleted = await auth.deleteAccount()
	if (!deleted) return

	auth.logout()
	router.push('/signup')
}
</script>

<template>
	<div class="mx-auto w-full max-w-3xl space-y-6">
		<div class="rounded-2xl bg-white p-6 shadow-sm">
			<h2 class="text-base font-semibold text-gray-900">Account settings</h2>
			<p class="mt-1 text-sm text-gray-500">Update your profile details and security settings.</p>
		</div>

		<p v-if="auth.error" class="text-sm text-red-700">{{ auth.error }}</p>

		<section class="rounded-2xl bg-white p-6 shadow-sm">
			<h3 class="text-sm font-semibold text-gray-900">Profile</h3>
			<p class="mt-1 text-sm text-gray-500">Change your display name.</p>

			<div class="mt-5 space-y-4">
				<div>
					<label class="text-sm font-medium text-gray-700">Email</label>
					<input
						:value="auth.user?.email ?? ''"
						disabled
						type="text"
						class="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 shadow-sm outline-none"
					/>
				</div>

				<div>
					<label class="text-sm font-medium text-gray-700">Full name</label>
					<input
						v-model="fullName"
						required
						type="text"
						placeholder="Your name"
						class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
					/>
				</div>

				<div class="flex items-center justify-end">
					<button
						type="button"
						class="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-60"
						:disabled="savingProfile"
						@click="saveProfile"
					>
						{{ savingProfile ? 'Saving…' : 'Save' }}
					</button>
				</div>
			</div>
		</section>

		<section class="rounded-2xl bg-white p-6 shadow-sm">
			<h3 class="text-sm font-semibold text-gray-900">Password</h3>
			<p class="mt-1 text-sm text-gray-500">Change your password.</p>

			<div class="mt-5 space-y-4">
				<div>
					<label class="text-sm font-medium text-gray-700">Current password</label>
					<input
						v-model="currentPassword"
						type="password"
						autocomplete="current-password"
						class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
					/>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<label class="text-sm font-medium text-gray-700">New password</label>
						<input
							v-model="newPassword"
							type="password"
							autocomplete="new-password"
							class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
						/>
					</div>

					<div>
						<label class="text-sm font-medium text-gray-700">Confirm password</label>
						<input
							v-model="confirmPassword"
							type="password"
							autocomplete="new-password"
							class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
						/>
					</div>
				</div>

				<p v-if="passwordMismatch" class="text-sm text-red-700">Passwords do not match.</p>

				<div class="flex items-center justify-end">
					<button
						type="button"
						class="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-60"
						:disabled="savingPassword"
						@click="savePassword"
					>
						{{ savingPassword ? 'Saving…' : 'Save password' }}
					</button>
				</div>
			</div>
		</section>

		<section class="rounded-2xl bg-white p-6 shadow-sm">
			<h3 class="text-sm font-semibold text-gray-900">Delete account</h3>
			<p class="mt-1 text-sm text-gray-500">
				Permanently remove your account and all related devices.
			</p>

			<div class="mt-5 flex items-center justify-end">
				<button
					type="button"
					class="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
					@click="deleteAccount"
				>
					Delete account
				</button>
			</div>
		</section>
	</div>
</template>
