import { fetchForeignRates } from '@/lib/actions/trips'
import { NewTripForm } from './NewTripForm'

export default async function NewTripPage() {
  const rates = await fetchForeignRates()
  return <NewTripForm rates={rates} />
}
