import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Checkbox from './Checkbox.vue'

describe('Checkbox', () => {
  it('emits checked updates when clicked', async () => {
    const wrapper = mount(Checkbox, {
      props: {
        checked: false,
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(0)).toEqual([true])
  })
})
